import { Redirect } from 'expo-router';

// The centre "+" tab opens /task/new directly; this route only exists to hold the tab slot.
export default function Add() {
  return <Redirect href="/task/new" />;
}
