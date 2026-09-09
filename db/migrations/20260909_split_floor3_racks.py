"""Migrate floor-3 rack IDs without resetting inventory or disabling foreign keys.

Default: read-only plan. --apply saves a private backup and commits one transaction.
Credentials are read from the private Spring YAML, never printed or embedded.
Requires PyMySQL and PyYAML. Run when clients can refresh their cached map afterward.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import ssl
import urllib.parse
import urllib.request

import pymysql
import yaml

ROOT = Path(__file__).resolve().parents[2]
CSV = Path(__file__).with_name('20260909_floor3_location_ids.csv')
TABLES = ('stocks', 'shelf_configs', 'shelf_events', 'consumer_events')
TOKEN = re.compile(r'(?<![\w-])F3-[AB]-R\d{2}-B\d{2}-L[1-6](?![\w-])')
LOCK = 'storeflow_floor3_racks_20260909'


def mappings():
    with CSV.open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        for k in ('x', 'y', 'level_no', 'old_rack', 'old_bay', 'new_rack', 'new_bay'):
            row[k] = int(row[k])
    assert len(rows) == len({r['old_id'] for r in rows}) == len({r['new_id'] for r in rows}) == 1020
    return rows


def rewrite(value, mapping):
    """Replace complete location tokens once; overlapping old/new IDs cannot cascade."""
    if isinstance(value, str):
        return TOKEN.sub(lambda m: mapping.get(m.group(), m.group()), value)
    if isinstance(value, list):
        return [rewrite(v, mapping) for v in value]
    if isinstance(value, dict):
        return {rewrite(k, mapping): rewrite(v, mapping) for k, v in value.items()}
    return value


def durable_json(path, value):
    import os
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, default=str)
        stream.flush()
        os.fsync(stream.fileno())


def physical_inventory(cur):
    cur.execute("""SELECT s.sku_id,l.zone_id,l.x,l.y,l.level_no,s.qty
                   FROM stocks s JOIN locations l USING(location_id)
                   WHERE l.zone_id IN ('F3-A','F3-B')
                   ORDER BY s.sku_id,l.zone_id,l.x,l.y,l.level_no""")
    return cur.fetchall()


def preserve_timestamps(cur, table):
    cur.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS '
                'WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND EXTRA LIKE %s',
                (table, '%on update%'))
    return ''.join(f", t.`{r['COLUMN_NAME']}`=t.`{r['COLUMN_NAME']}`" for r in cur.fetchall())


def run(args):
    config = yaml.safe_load(args.config.read_text(encoding='utf-8'))['spring']['datasource']
    url = urllib.parse.urlparse(config['url'].removeprefix('jdbc:'))
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    ca = args.ssl_ca or output / 'rds-global-bundle.pem'
    if not ca.exists():
        if args.ssl_ca:
            raise FileNotFoundError(ca)
        with urllib.request.urlopen('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem', timeout=20) as response:
            ca.write_bytes(response.read())
    conn = pymysql.connect(host=url.hostname, port=url.port or 3306, user=config['username'],
                           password=config['password'], database=url.path.lstrip('/'), ssl=ssl.create_default_context(cafile=str(ca)),
                           connect_timeout=10, read_timeout=120, write_timeout=120,
                           autocommit=False, cursorclass=pymysql.cursors.DictCursor)
    rows = mappings()
    mapping = {r['old_id']: r['new_id'] for r in rows}
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    report = {'database': url.path.lstrip('/'), 'rds': '.rds.amazonaws.com' in (url.hostname or ''),
              'mapping_sha256': hashlib.sha256(CSV.read_bytes()).hexdigest(), 'apply': args.apply}
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT GET_LOCK(%s,10) AS acquired', (LOCK,))
            if cur.fetchone()['acquired'] != 1:
                raise RuntimeError('Another location migration is running')
            cur.execute('SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE')
            conn.begin()
            cur.execute("SELECT * FROM locations WHERE zone_id IN ('F3-A','F3-B') ORDER BY location_id FOR UPDATE")
            locations = cur.fetchall()
            at = {(l['zone_id'], l['x'], l['y'], l['level_no']): l for l in locations}
            if len(at) != len(locations) or len(locations) != 1260:
                raise RuntimeError('Unexpected/duplicate floor-3 physical locations')
            def matches(row, prefix):
                loc = at.get((row['zone_id'], row['x'], row['y'], row['level_no']), {})
                return (loc.get('location_id'), loc.get('rack_no'), loc.get('bay_no')) == (
                    row[f'{prefix}_id'], row[f'{prefix}_rack'], row[f'{prefix}_bay'])
            if all(matches(r, 'new') for r in rows):
                conn.rollback()
                report['status'] = 'already_applied'
                return report
            if not all(matches(r, 'old') for r in rows):
                raise RuntimeError('DB is neither the complete old layout nor the complete new layout; refusing a mixed migration')
            cur.execute("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE "
                        "WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='locations'")
            unexpected = [r for r in cur.fetchall() if r['TABLE_NAME'] not in TABLES or r['COLUMN_NAME'] != 'location_id']
            if unexpected:
                raise RuntimeError(f'Unmapped location foreign keys: {unexpected}')
            cur.execute("SELECT COUNT(*) n FROM locations WHERE location_id LIKE 'SF0909T%'")
            if cur.fetchone()['n']:
                raise RuntimeError('Temporary migration IDs already exist')
            cur.execute('CREATE TEMPORARY TABLE sf_location_map (old_id VARCHAR(24) PRIMARY KEY, '
                        'new_id VARCHAR(24) UNIQUE, temp_id VARCHAR(24) UNIQUE, rack_no TINYINT, bay_no TINYINT) '
                        'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
            cur.executemany('INSERT INTO sf_location_map VALUES (%s,%s,%s,%s,%s)',
                            [(r['old_id'], r['new_id'], f'SF0909T{i:04d}', r['new_rack'], r['new_bay'])
                             for i, r in enumerate(rows)])
            backup = {'mapping': rows, 'locations': locations, 'references': {}, 'embedded': {}}
            cur.execute('SELECT * FROM map_cells ORDER BY floor_no,x,y')
            map_before = cur.fetchall()
            inventory_before = physical_inventory(cur)
            timestamps = {t: preserve_timestamps(cur, t) for t in TABLES}
            counts = {}
            for table in TABLES:
                cur.execute(f'SELECT t.* FROM `{table}` t JOIN sf_location_map m ON t.location_id=m.old_id FOR UPDATE')
                backup['references'][table] = cur.fetchall()
                counts[table] = len(backup['references'][table])

            # Structured payloads can contain prev_location_id, lists or nested location anchors.
            # Historical chat prose is preserved as history; it is not an operational location column.
            embedded = []
            for table, pk, column, is_json in (
                ('shelf_events', 'event_id', 'payload', True),
                ('consumer_events', 'event_id', 'payload', True),
                ('products', 'sku_id', 'spec', True),
                ('event_log', 'event_id', 'ref_id', False),
                ('notification', 'notification_id', 'link_url', False),
            ):
                cur.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s', (table,))
                columns = {r['COLUMN_NAME'] for r in cur.fetchall()}
                if column not in columns:
                    continue
                # Derive the actual single-column primary key instead of assuming backend naming.
                cur.execute("SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() "
                            "AND TABLE_NAME=%s AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION", (table,))
                primary = [r['COLUMN_NAME'] for r in cur.fetchall()]
                if len(primary) != 1:
                    raise RuntimeError(f'Expected a single primary key for {table}')
                pk = primary[0]
                cur.execute(f'SELECT `{pk}` AS row_id,`{column}` AS value FROM `{table}` '
                            f'WHERE CAST(`{column}` AS CHAR) LIKE %s OR CAST(`{column}` AS CHAR) LIKE %s FOR UPDATE',
                            ('%F3-A-R%', '%F3-B-R%'))
                changes = []
                for record in cur.fetchall():
                    original = json.loads(record['value']) if is_json else record['value']
                    updated = rewrite(original, mapping)
                    if updated != original:
                        changes.append((record['row_id'], json.dumps(updated, ensure_ascii=False) if is_json else updated))
                        backup['embedded'].setdefault(f'{table}.{column}', []).append(record)
                if changes:
                    embedded.append((table, pk, column, changes))
            report.update(status='planned', changed_locations=len(rows), references=counts,
                          embedded={f'{t}.{col}': len(changes) for t, _, col, changes in embedded})
            if not args.apply and not args.rollback_test:
                conn.rollback()
                return report
            backup_path = output / f'backup-{stamp}.json'
            durable_json(backup_path, backup)
            report['backup'] = str(backup_path)

            # Parent clones keep all FK checks enabled while overlapping old/new names move.
            cur.execute('INSERT INTO locations SELECT m.temp_id,l.zone_id,l.rack_no,l.bay_no,l.level_no,l.tier_role,l.floor_no,l.x,l.y '
                        'FROM locations l JOIN sf_location_map m ON l.location_id=m.old_id')
            for table in TABLES:
                cur.execute(f'UPDATE `{table}` t JOIN sf_location_map m ON t.location_id=m.old_id '
                            f'SET t.location_id=m.temp_id{timestamps[table]}')
            cur.execute('DELETE l FROM locations l JOIN sf_location_map m ON l.location_id=m.old_id')
            cur.execute('INSERT INTO locations SELECT m.new_id,l.zone_id,m.rack_no,m.bay_no,l.level_no,l.tier_role,l.floor_no,l.x,l.y '
                        'FROM locations l JOIN sf_location_map m ON l.location_id=m.temp_id')
            for table in TABLES:
                cur.execute(f'UPDATE `{table}` t JOIN sf_location_map m ON t.location_id=m.temp_id '
                            f'SET t.location_id=m.new_id{timestamps[table]}')
            cur.execute('DELETE l FROM locations l JOIN sf_location_map m ON l.location_id=m.temp_id')
            for index, (table, pk, column, changes) in enumerate(embedded):
                temp = f'sf_payload_{index}'
                cur.execute(f'CREATE TEMPORARY TABLE {temp} (row_id BIGINT PRIMARY KEY,value LONGTEXT) CHARACTER SET utf8mb4')
                cur.executemany(f'INSERT INTO {temp} VALUES (%s,%s)', changes)
                keep_time = preserve_timestamps(cur, table)
                cur.execute(f'UPDATE `{table}` t JOIN {temp} v ON t.`{pk}`=v.row_id SET t.`{column}`=v.value{keep_time}')
            if physical_inventory(cur) != inventory_before:
                raise RuntimeError('Physical SKU/quantity assignment changed; rolling back')
            cur.execute('SELECT * FROM map_cells ORDER BY floor_no,x,y')
            if cur.fetchall() != map_before:
                raise RuntimeError('Map geometry changed; rolling back')
            for table in TABLES:
                cur.execute(f'SELECT t.* FROM `{table}` t JOIN sf_location_map m ON t.location_id=m.new_id')
                observed = cur.fetchall()
                expected = [dict(r, location_id=mapping[r['location_id']]) for r in backup['references'][table]]
                def normalize(records, translate_payload=False):
                    values = []
                    for record in records:
                        record = dict(record)
                        if record.get('payload') is not None:
                            value = json.loads(record['payload'])
                            record['payload'] = rewrite(value, mapping) if translate_payload else value
                        values.append(json.dumps(record, sort_keys=True, default=str))
                    return sorted(values)
                if len(observed) != counts[table] or normalize(observed) != normalize(expected, True):
                    raise RuntimeError(f'Reference content changed beyond location mapping for {table}; rolling back')
            cur.execute("SELECT * FROM locations WHERE zone_id IN ('F3-A','F3-B') ORDER BY location_id")
            after = cur.fetchall()
            at = {(l['zone_id'], l['x'], l['y'], l['level_no']): l for l in after}
            if len(after) != 1260 or not all(matches(r, 'new') for r in rows):
                raise RuntimeError('New locations do not match physical mapping; rolling back')
            cur.execute("SELECT COUNT(*) n FROM locations WHERE location_id LIKE 'SF0909T%'")
            assert cur.fetchone()['n'] == 0
            if args.rollback_test:
                conn.rollback()
            else:
                conn.commit()
            report.update(status='rollback_test_passed' if args.rollback_test else 'applied',
                          physical_inventory_preserved=True, map_cells_preserved=True)
            return report
    except Exception as error:
        conn.rollback()
        report.update(status='failed_rolled_back', error_type=type(error).__name__)
        raise
    finally:
        with conn.cursor() as cur:
            cur.execute('SELECT RELEASE_LOCK(%s)', (LOCK,))
        conn.close()
        durable_json(output / f'report-{stamp}.json', report)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=ROOT / 'Backend/src/main/resources/application.yml')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--ssl-ca', type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--rollback-test', action='store_true', help='Validate the full transaction, then roll it back')
    result = run(parser.parse_args())
    print(json.dumps(result, ensure_ascii=False))
