package com.storeflow.demo;

import java.time.LocalDate;
import java.util.List;

/** Fixed six-day demonstration roster; does not alter the application clock. */
public final class GoldenDemoPlan {
 public static final LocalDate START=LocalDate.of(2026,9,10);
 public static final List<String> PHONES=List.of("01090000001","01090000002","01090000003","01090000004","01090000005","01090000006");
 public static final int[] SKUS={205400,201520,200550,204820,203330,202100,207291,204821,204822,200001};
 private GoldenDemoPlan(){}
 public static LocalDate dateFor(String phone){
  int index=PHONES.indexOf(phone);
  if(index<0)throw new IllegalArgumentException("시연 계정이 아닙니다.");
  return START.plusDays(index);
 }
 public static String phoneFor(LocalDate date){
  long index=java.time.temporal.ChronoUnit.DAYS.between(START,date);
  return index<0||index>=PHONES.size()?null:PHONES.get((int)index);
 }
 public static String historyPrefix(LocalDate date){
  if(phoneFor(date)==null)throw new IllegalArgumentException("시연 기간이 아닙니다.");
  return date.equals(START)?"golden-09010-":"golden-09"+date.getDayOfMonth()+"-";
 }
}
