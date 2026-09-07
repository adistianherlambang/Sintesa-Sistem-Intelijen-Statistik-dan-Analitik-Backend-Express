import mongoose from "mongoose";

const SystemConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "app_features",
    },
    features: {
      analisis: {
        id: { type: String, default: "analisis" },
        name: { type: String, default: "Workspace Analisis" },
        tab: { type: String, default: "workspace" },
        description: { type: String, default: "Kontrol akses halaman dan tombol tab Analisis & Histori Laporan BRS bagi role user" },
        enabled: { type: Boolean, default: true },
      },
      bot: {
        id: { type: String, default: "bot" },
        name: { type: String, default: "Bot WhatsApp" },
        tab: { type: String, default: "bot" },
        description: { type: String, default: "Kontrol akses halaman dan tombol tab Sambungkan Akun & Bot Knowledge bagi role user" },
        enabled: { type: Boolean, default: true },
      },
      infografis: {
        id: { type: String, default: "infografis" },
        name: { type: String, default: "Infografis" },
        tab: { type: String, default: "infografis" },
        description: { type: String, default: "Kontrol akses halaman dan tombol tab Buat Infografis & Histori Grafis bagi role user" },
        enabled: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("SystemConfig", SystemConfigSchema);
