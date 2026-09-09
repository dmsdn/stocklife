"""PDF rack-count and continuity contracts; no database or seed files are written."""
import unittest
from collections import defaultdict
from unittest.mock import patch

import world_gen as world


class RackLayoutTests(unittest.TestCase):
    def test_all_nineteen_pdf_zone_counts(self):
        expected = {'F1-A': 7, 'F1-B': 10, 'F1-C': 8, 'F1-D': 7, 'F1-E': 8,
                    'F1-F': 7, 'F1-G': 6, 'F1-H': 10, 'F2-A': 6, 'F2-B': 6,
                    'F2-C': 6, 'F2-D': 4, 'F2-E': 6, 'F2-F': 6,
                    'F3-A': 12, 'F3-B': 8, 'F3-C': 6, 'F3-D': 10, 'F3-E': 4}
        groups = defaultdict(set)
        rows = world.gen_locations()
        for row in rows:
            if row[5] == 'PICK':
                groups[row[1]].add(row[2])
        self.assertEqual({z: len(racks) for z, racks in groups.items()}, expected)
        self.assertEqual(len(rows), len({r[0] for r in rows}))

    def test_every_rack_is_contiguous_and_bays_restart_at_one(self):
        racks = defaultdict(list)
        for row in world.gen_locations():
            if row[5] == 'PICK' and row[4] == 1:
                racks[row[1], row[2]].append(row)
        for key, rows in racks.items():
            rows.sort(key=lambda r: r[3])
            self.assertEqual([r[3] for r in rows], list(range(1, len(rows) + 1)), key)
            for a, b in zip(rows, rows[1:]):
                self.assertEqual(abs(a[7] - b[7]) + abs(a[8] - b[8]), world.BAY_CELLS, key)

    def test_gap_and_input_order(self):
        bays = [(3, 'A', 71, 4, 'L'), (3, 'A', 71, 6, 'L'), (3, 'A', 71, 28, 'L')]
        def selected():
            return [r for r in world.gen_locations() if r[1] == 'F3-A' and r[4] == 1]
        with patch.object(world, 'BAYS', bays):
            first = selected()
        with patch.object(world, 'BAYS', list(reversed(bays))):
            self.assertEqual(selected(), first)
        self.assertEqual([(r[2], r[3], r[7], r[8]) for r in first],
                         [(1, 1, 70, 4), (1, 2, 70, 6), (2, 1, 70, 28)])


if __name__ == '__main__':
    unittest.main()
