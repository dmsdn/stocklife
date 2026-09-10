package com.storeflow.navigation.service;

import com.storeflow.navigation.model.GridKey;
import com.storeflow.navigation.model.NavigationGraph;
import java.util.*;

/** Shortest walking distance first; among equal distances prefer fewer turns. */
public final class AStarPathfinder {
    private AStarPathfinder() {}
    public record Result(List<GridKey> path, int cost) {}
    private record State(GridKey key, int direction) {}
    private record Score(int distance, int turns) implements Comparable<Score> {
        public int compareTo(Score b) {
            int d=Integer.compare(distance,b.distance); return d!=0?d:Integer.compare(turns,b.turns);
        }
    }
    private record Entry(State state, Score score, int estimate, long sequence) {}
    public static Result findPath(NavigationGraph graph, GridKey start, GridKey goal) {
        return findPath(graph,start,goal,false);
    }
    public static Result findPath(NavigationGraph graph, GridKey start, GridKey goal, boolean escalatorsOnly) {
        if (!graph.isPassable(start)||!graph.isPassable(goal)) return null;
        if(start.equals(goal)) return new Result(List.of(start),0);
        State initial=new State(start,0);
        Map<State,Score> best=new HashMap<>(); Map<State,State> previous=new HashMap<>();
        PriorityQueue<Entry> open=new PriorityQueue<>(Comparator.comparingInt(Entry::estimate)
            .thenComparingInt(e->e.score().turns()).thenComparingLong(Entry::sequence));
        long sequence=0; Score zero=new Score(0,0); best.put(initial,zero);
        open.add(new Entry(initial,zero,0,sequence++));
        while(!open.isEmpty()) {
            Entry entry=open.poll(); State current=entry.state();
            if(!entry.score().equals(best.get(current))) continue;
            if(current.key().equals(goal)) {
                LinkedList<GridKey> path=new LinkedList<>(); State s=current;
                while(s!=null){path.addFirst(s.key());s=previous.get(s);}
                return new Result(path,entry.score().distance());
            }
            for(NavigationGraph.Edge edge:graph.neighbors(current.key(),escalatorsOnly)) {
                int direction=direction(current.key(),edge.to());
                State next=new State(edge.to(),direction);
                int turn=current.direction()!=0 && direction!=0 && current.direction()!=direction?1:0;
                Score score=new Score(entry.score().distance()+edge.cost(),entry.score().turns()+turn);
                if(best.containsKey(next)&&score.compareTo(best.get(next))>=0) continue;
                best.put(next,score);previous.put(next,current);
                int heuristic=escalatorsOnly?Math.abs(edge.to().x()-goal.x())+Math.abs(edge.to().y()-goal.y())+3*Math.abs(edge.to().floorNo()-goal.floorNo()):0;
                open.add(new Entry(next,score,score.distance()+heuristic,sequence++));
            }
        }
        return null;
    }
    private static int direction(GridKey a,GridKey b) {
        if(a.floorNo()!=b.floorNo()) return 0;
        if(b.x()>a.x())return 1;if(b.x()<a.x())return 2;
        if(b.y()>a.y())return 3;if(b.y()<a.y())return 4;return 0;
    }
}
