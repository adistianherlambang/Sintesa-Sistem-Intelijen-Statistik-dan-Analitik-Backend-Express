import cron from "node-cron";

//services
import { fetchBPS } from "../services/fetchBPS";

export const startBPSCron = () => {
  cron.schedule("0 0 7 * *", async () => {
    console.log("Running Cron BPS")
    await fetchBPS
  })
}