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
      aiForecasting: {
        id: { type: String, default: "aiForecasting" },
        name: { type: String, default: "AI Forecasting & Proyeksi" },
        category: { type: String, default: "Kecerdasan Buatan" },
        description: { type: String, default: "Pemodelan dan narasi prediksi tingkat inflasi berbasis Artificial Neural Network" },
        enabled: { type: Boolean, default: true },
      },
      whatsappBot: {
        id: { type: String, default: "whatsappBot" },
        name: { type: String, default: "WhatsApp Bot Statistik BPS" },
        category: { type: String, default: "Layanan Chatbot" },
        description: { type: String, default: "Layanan auto-response interaktif data statistik kota kepada masyarakat via WhatsApp" },
        enabled: { type: Boolean, default: true },
      },
      wordExport: {
        id: { type: String, default: "wordExport" },
        name: { type: String, default: "Ekspor Dokumen Word BRS" },
        category: { type: String, default: "Publikasi Dokumen" },
        description: { type: String, default: "Mesin generate dan editor dokumen Berita Resmi Statistik (.docx) via ONLYOFFICE" },
        enabled: { type: Boolean, default: true },
      },
      infografis: {
        id: { type: String, default: "infografis" },
        name: { type: String, default: "Pembuatan Visual Infografis" },
        category: { type: String, default: "Media Grafis" },
        description: { type: String, default: "Editor dan generator infografis visual BRS untuk publikasi media sosial" },
        enabled: { type: Boolean, default: true },
      },
      userRegistration: {
        id: { type: String, default: "userRegistration" },
        name: { type: String, default: "Pendaftaran Pengguna Baru" },
        category: { type: String, default: "Autentikasi" },
        description: { type: String, default: "Mengizinkan pendaftaran akun instansi/operator baru ke dalam sistem" },
        enabled: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("SystemConfig", SystemConfigSchema);
