import cron from "node-cron";
import APIDataBPS from "../db/models/APIDataBPS.js";
import { fetchBPS } from "../services/fetchBPS.js";
import { fetchBPSYoY } from "../services/fetchBPSYoY.js";
// import { AISummary } from "../services/AISummary.js";

export const startBPSCron = () => {
  console.log("✔ Cron Registered", new Date());

  // Setiap tanggal 1-8 jam 07:00 WIB
  cron.schedule(
    "0 7 1-8 * *",
    async () => {
      try {
        console.log("✔ Cron Executed", new Date());
        console.log("Running Cron BPS...");

        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();

        const latest = await APIDataBPS.findOne()
          .sort({ lastUpdate: -1 })
          .select("lastUpdate")
          .lean();

        // Jika belum ada data sama sekali
        if (!latest?.lastUpdate) {
          console.log("⚠ No data found, fetching...");
          await fetchBPS();
          await AISummary();
          return;
        }

        const lastUpdate = new Date(latest.lastUpdate);

        // Jika bulan & tahun sama -> skip
        if (
          lastUpdate.getMonth() === month &&
          lastUpdate.getFullYear() === year
        ) {
          console.log("⚠ Data bulan ini sudah tersedia, skip fetch.");
          return;
        }

        console.log("✔ Fetching new BPS data...");
        await fetchBPS();
        await AISummary();
      } catch (err) {
        console.error("✖ Cron BPS Error:", err.message);
      }
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  // Setiap tanggal 1-10 Januari jam 00:00 WIB (Untuk YoY)
  cron.schedule(
    "0 0 1-10 1 *",
    async () => {
      try {
        console.log("✔ Cron YoY Executed", new Date());

        const now = new Date();
        const month = now.getMonth(); // Januari = 0
        const year = now.getFullYear();

        const latest = await APIDataBPS.findOne()
          .sort({ lastUpdate: -1 })
          .select("lastUpdate")
          .lean();

        if (!latest?.lastUpdate) {
          console.log("⚠ lastUpdate tidak ditemukan, skip YoY.");
          return;
        }

        const lastUpdate = new Date(latest.lastUpdate);
        const lastYear = lastUpdate.getFullYear();

        console.log(
          `Now Month: ${month} | Now Year: ${year} | Last Data Year: ${lastYear}`,
        );

        // Jalankan jika data terakhir di DB belum diperbarui ke tahun yang sekarang
        if (month === 0 && lastYear !== year) {
          console.log("✔ Jalankan fungsi fetch YoY...");
          await fetchBPSYoY();
        } else {
          console.log("⚠ Tidak perlu update YoY");
        }
      } catch (err) {
        console.log("✖ Cron YoY Error:", err.message);
      }
    },
    {
      timezone: "Asia/Jakarta",
    },
  );
};
