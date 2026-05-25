import cron from "node-cron";
import APIDataBPS from "../db/models/APIDataBPS.js";
import { fetchBPS } from "../services/fetchBPS.js";
import { AISummary } from "../services/AISummary.js";

export const startBPSCron = () => {
  console.log("Cron Registered", new Date());

  // setiap tanggal 1-8 jam 07:00 WIB
  cron.schedule(
    "0 7 1-8 * *",
    async () => {
      try {
        console.log("Cron Executed", new Date());
        console.log("Running Cron BPS");

        const now = new Date();

        const month = now.getMonth();
        const year = now.getFullYear();

        const latest = await APIDataBPS.findOne()
          .sort({ lastUpdate: -1 })
          .select("lastUpdate")
          .lean();

        // jika belum ada data sama sekali
        if (!latest) {
          console.log("No data found, fetching...");

          await fetchBPS();
          await AISummary();

          return;
        }

        const lastUpdate = new Date(latest.lastUpdate);

        const lastMonth = lastUpdate.getMonth();
        const lastYear = lastUpdate.getFullYear();

        // jika bulan & tahun sama -> skip
        if (lastMonth === month && lastYear === year) {
          console.log("Data bulan ini sudah tersedia");
          return;
        }

        console.log("Fetching new BPS data...");

        await fetchBPS();
        await AISummary();
      } catch (err) {
        console.error(err.message);
      }
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  cron.schedule("0 0 1-10 1 *", async () => {

  try {

    const now = new Date();

    const month = now.getMonth();

    const year = now.getFullYear();

    const latest = await APIDataBPS.findOne()

      .sort({ lastUpdate: -1 })

      .select("lastUpdate")

      .lean();

    if (!latest?.lastUpdate) {

      console.log("⚠ lastUpdate tidak ditemukan");

      return;

    }

    const lastUpdate = new Date(latest.lastUpdate);

    const lastMonth = lastUpdate.getMonth();

    const lastYear = lastUpdate.getFullYear();

    console.log({

      nowMonth: month,

      nowYear: year,

      lastMonth,

      lastYear,

    });

    // Januari = 0

    // Jalankan jika data terakhir bukan tahun sekarang

    if (month === 0 && lastYear !== year) {

      console.log("✔ Jalankan fungsi fetch");

      await fetchBPSYoY();

    } else {

      console.log("⚠ Tidak perlu update");

    }

  } catch (err) {

    console.log("✖ Cron error:", err.message);

  }

});


};
