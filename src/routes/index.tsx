import { createFileRoute } from "@tanstack/react-router";
import { GaitApp } from "@/components/gait/GaitApp";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <GaitApp />;
}
