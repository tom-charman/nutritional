import { resetE2EData } from "./reset-db";

export default async function globalSetup() {
  await resetE2EData();
}
