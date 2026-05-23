import cron from "node-cron";
import APIDataBPS from "../db/models/APIDataBPS.js";
import { fetchBPS } from "./fetchBPS.js";
import { AISum } from "../services/AISummary.js";

export const startBPSCron = () => {

  // setiap tanggal 1-8 jam 07:00
  cron.schedule("0 7 1-8 * *", async () => {

    try {

      console.log("Running Cron BPS");

      const now = new Date();

      const month = now.getMonth();
      const year = now.getFullYear();

      const latest = await APIDataBPS
        .findOne()
        .sort({ lastUpdate: -1 })
        .select("lastUpdate")
        .lean();

      // jika belum ada data sama sekali
      if (!latest) {

        console.log("No data found, fetching...");
        await fetchBPS();
        await AISum()

        return;
      }

      const lastUpdate = new Date(latest.lastupdate);

      const lastMonth = lastUpdate.getMonth();
      const lastYear = lastUpdate.getFullYear();

      // jika bulan & tahun sama -> skip
      if (
        lastMonth === month &&
        lastYear === year
      ) {

        console.log("Data bulan ini sudah tersedia");
        return;
      }

      console.log("Fetching new BPS data...");
      await fetchBPS();
      await AISum()

    } catch (err) {

      console.error(err.message);

    }
  });
};