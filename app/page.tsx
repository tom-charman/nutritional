import { redirect } from "next/navigation";

// Daily Entry is the app's landing surface; the dashboard lives at /dashboard.
export default function Home() {
  redirect("/entry");
}
