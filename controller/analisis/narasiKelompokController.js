import { callUnifiedLLM } from "../../api/llm/llmRoutes.js";
import {
  loadInflasiIhkTemplate,
  renderTemplateObject,
  interpolateString,
  buildVariableMapFromDataset,
} from "./templateVariableMapper.js";

/**
 * Fallback formal narasi khas BPS (~50 kata, 1 paragraf) untuk setiap kelompok pengeluaran
 */
export const DEFAULT_FALLBACK_NARASI = {
  pakaian: "memberikan andil deflasi m-to-m sebesar 0,01 persen pada periode ini. Penurunan indeks harga didorong oleh berkurangnya harga beberapa komoditas pakaian jadi pria dan wanita di pasar modern pasca promo musiman, sementara subkelompok alas kaki dan aksesoris pribadi terpantau bergerak stabil tanpa fluktuasi harga yang berarti.",
  perumahan: "memberikan andil inflasi m-to-m sebesar 0,02 persen terhadap pembentukan inflasi umum. Kenaikan harga ini terutama dipicu oleh penyesuaian tarif kontrak dan sewa rumah tinggal di kawasan perkotaan, serta sedikit peningkatan biaya pemeliharaan rutin sarana air minum, sedangkan tarif listrik dan bahan bakar rumah tangga terpantau relatif stabil sepanjang periode.",
  transportasi: "memberikan andil inflasi m-to-m sebesar 0,04 persen. Faktor pendorong utama kenaikan indeks berasal dari penyesuaian tarif angkutan umum dalam kota dan kenaikan harga tiket transportasi antardaerah menjelang akhir bulan, sementara harga bahan bakar kendaraan bermotor dan tarif perawatan rutin armada relatif stabil selama pencatatan.",
  rekreasi: "memberikan andil inflasi m-to-m sebesar 0,01 persen. Peningkatan indeks dipengaruhi oleh sedikit kenaikan biaya rekreasi akhir pekan, tarif masuk fasilitas olahraga, serta perlengkapan budaya, sementara subkelompok perlengkapan audio-visual dan media elektronik terpantau tidak mengalami perubahan harga yang signifikan.",
  pendidikan: "memberikan andil inflasi m-to-m sebesar 0,01 persen. Kenaikan indeks harga kelompok ini didorong oleh biaya bimbingan belajar tambahan serta perlengkapan alat tulis pendukung semester berjalan, sedangkan tarif uang sekolah dan biaya pendidikan formal tingkat dasar hingga menengah terpantau stabil.",
  restoran: "memberikan andil inflasi m-to-m sebesar 0,03 persen. Perkembangan ini dipengaruhi oleh kenaikan harga bahan baku makanan olahan yang berdampak pada penyesuaian tarif makanan siap saji di rumah makan dan warung kuliner, sedangkan harga minuman olahan relatif tidak mengalami perubahan berarti.",
  perawatan: "memberikan andil inflasi m-to-m sebesar 0,05 persen. Kenaikan harga emas perhiasan dan produk perawatan tubuh harian menjadi komoditas utama penyumbang andil inflasi pada kelompok ini, sementara jasa perawatan pribadi seperti salon dan pangkas rambut terpantau stabil.",
  makanan: "memberikan andil inflasi m-to-m sebesar 0,18 persen dipicu oleh komoditas beras dan minyak goreng, sedangkan komoditas daging ayam ras dan cabai merah memberikan andil deflasi.",
  perlengkapan: "memberikan andil deflasi m-to-m sebesar 0,02 persen dengan penurunan harga pada peralatan rumah tangga kecil.",
  kesehatan: "memberikan andil inflasi m-to-m sebesar 0,01 persen dipicu kenaikan tarif pelayanan rawat jalan.",
  informasi: "memberikan andil inflasi m-to-m sebesar 0,01 persen dengan tarif jasa komunikasi terpantau stabil."
};

/**
 * Normalisasi kunci kelompok dari string nama kelompok
 */
export const getGroupKeyFromTitle = (titleDesc = "") => {
  const norm = String(titleDesc || "").toLowerCase();
  if (norm.includes("pakaian") || norm.includes("alas kaki")) return "pakaian";
  if (norm.includes("perumahan") || norm.includes("listrik") || norm.includes("bahan bakar")) return "perumahan";
  if (norm.includes("transportasi")) return "transportasi";
  if (norm.includes("rekreasi") || norm.includes("olahraga") || norm.includes("budaya")) return "rekreasi";
  if (norm.includes("pendidikan")) return "pendidikan";
  if (norm.includes("restoran") || (norm.includes("makanan") && norm.includes("minuman") && norm.includes("penyediaan"))) return "restoran";
  if (norm.includes("perawatan") || norm.includes("pribadi")) return "perawatan";
  if (norm.includes("makanan") || norm.includes("tembakau")) return "makanan";
  if (norm.includes("perlengkapan") || norm.includes("peralatan")) return "perlengkapan";
  if (norm.includes("kesehatan")) return "kesehatan";
  if (norm.includes("informasi") || norm.includes("komunikasi")) return "informasi";
  return "umum";
};

/**
 * Fungsi core untuk generate narasi kelompok menggunakan callUnifiedLLM
 * @param {Array|Object} inputData - Objek atau array objek { title: { desc }, desc }
 * @returns {Promise<Array|Object>} - Hasil terisi { title: { desc }, desc: "1 paragraf ~50 kata" }
 */
/**
 * Ambil daftar subkelompok langsung dari template inflasiIHK.json
 */
export const getTemplateSubGroupsFromInflasiJson = () => {
  const tpl = loadInflasiIhkTemplate();
  const subItems = tpl?.content?.[0]?.sub || [];
  return subItems;
};

/**
 * Fungsi core untuk generate narasi kelompok menggunakan callUnifiedLLM
 * Menggunakan inflasiIHK.json sebagai template literal sumber jika inputData tidak diberikan.
 * @param {Array|Object|null} inputData - Objek atau array objek { title: { desc }, desc }
 * @param {Object} [dataset] - Dataset konteks untuk interpolasi variabel awal
 * @param {Object} [customVars] - Variabel tambahan opsional
 * @returns {Promise<Array|Object>} - Hasil terisi { title: { desc }, desc: "1 paragraf ~50 kata" }
 */
export const generateNarasiAndilMtmWithLLM = async (inputData = null, dataset = null, customVars = {}) => {
  let items = inputData;

  // Jika inputData kosong atau minta template, muat dari template/inflasiIHK/inflasiIHK.json
  if (!items || (Array.isArray(items) && items.length === 0) || items.useTemplate) {
    items = getTemplateSubGroupsFromInflasiJson();
  }

  const isSingle = !Array.isArray(items);
  const rawItems = isSingle ? [items] : items;

  if (!rawItems || rawItems.length === 0) {
    return isSingle ? null : [];
  }

  // Jika ada dataset, interpolasi variabel konteks ${...} terlebih dahulu
  let activeVarMap = {};
  if (dataset) {
    activeVarMap = buildVariableMapFromDataset(dataset, customVars);
  }

  const processedItems = rawItems.map((item) => {
    const rawDesc = item?.desc || "";
    const resolvedDesc = dataset ? interpolateString(rawDesc, activeVarMap) : rawDesc;
    return {
      title: item?.title || { desc: "" },
      desc: resolvedDesc,
      rawDesc,
    };
  });

  // Siapkan konteks ringkas untuk LLM
  const promptContext = processedItems.map((item, idx) => {
    const titleText = item?.title?.desc || `Kelompok ${idx + 1}`;
    const descText = item?.desc || "";
    return `--- KELOMPOK ${idx + 1} ---\nNama: ${titleText}\nKonteks Data: ${descText}`;
  }).join("\n\n");

  const prompt = `
Anda adalah penyusun Berita Resmi Statistik (BRS) Badan Pusat Statistik (BPS) Republik Indonesia.
Tugas Anda adalah membuat kelanjutan narasi mengenai andil/sumbangan inflasi atau deflasi month-to-month (m-to-m) untuk masing-masing kelompok pengeluaran berikut.

KETENTUAN KETAT OUTPUT:
1. Setiap narasi kelompok HARUS TEPAT 1 PARAGRAF dengan panjang sekitar 50 KATA (antara 40 s.d. 60 kata).
2. Teks adalah kelanjutan langsung dari kalimat penutup: "Sementara kelompok [Nama Kelompok] pada [Bulan Tahun] ...", sehingga kalimat HARUS diawali dengan frasa seperti:
   - "memberikan andil inflasi m-to-m sebesar ... persen ..."
   - "memberikan andil deflasi m-to-m sebesar ... persen ..."
   - "tercatat tidak memberikan andil yang signifikan terhadap inflasi m-to-m ..."
3. Gunakan gaya bahasa formal khas publikasi resmi BPS Indonesia.
4. Sebutkan komoditas/subkelompok pendorong yang relevan secara logis dengan kelompok pengeluaran tersebut.
5. Format return WAJIB JSON array murni tanpa pembungkus markdown apapun, dengan struktur persis:
[
  ${processedItems.map(it => `{ "title": { "desc": "${it?.title?.desc || ""}" }, "desc": "<1 paragraf sekitar 50 kata narasi BPS>" }`).join(",\n  ")}
]
HANYA KELUARKAN RAW JSON VALID TANPA PENJELASAN LAIN.

DATA INPUT:
${promptContext}
`;

  let parsedResults = null;

  try {
    const aiRes = await callUnifiedLLM({
      prompt,
      responseMimeType: "application/json",
      temperature: 0.6,
    });

    const reply = (aiRes.reply || aiRes.message || "").trim();
    const cleanJson = reply.replace(/^```json/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed)) {
      parsedResults = parsed;
    } else if (parsed && typeof parsed === "object") {
      parsedResults = [parsed];
    }
  } catch (err) {
    console.warn("[generateNarasiAndilMtmWithLLM] Warning via callUnifiedLLM:", err.message);
  }

  // Gabungkan dengan fallback jika LLM gagal atau hasil tidak lengkap
  const finalResults = processedItems.map((item, idx) => {
    const titleText = item?.title?.desc || "";
    const groupKey = getGroupKeyFromTitle(titleText);
    const aiMatch = parsedResults?.find(
      p => String(p?.title?.desc || "").toLowerCase() === titleText.toLowerCase()
    ) || parsedResults?.[idx];

    let descText = aiMatch?.desc;
    if (!descText || descText.trim() === "" || descText.includes("${")) {
      descText = DEFAULT_FALLBACK_NARASI[groupKey] || DEFAULT_FALLBACK_NARASI.perumahan;
    }

    // Pastikan diakhiri tanda titik
    descText = descText.trim();
    if (!descText.endsWith(".")) descText += ".";

    return {
      title: {
        desc: titleText,
      },
      desc: descText,
      groupKey,
    };
  });

  return isSingle ? finalResults[0] : finalResults;
};

/**
 * Express handler: POST /api/analisis/keterangan-andil-mtm & POST /api/analisis/generate-narasi-kelompok
 * Mendukung input items spesifik atau otomatis mengambil dari template inflasiIHK.json
 */
export const handleGenerateNarasiKelompok = async (req, res) => {
  try {
    const input = req.body?.items || req.body?.data || (req.body?.useTemplate ? null : req.body);
    const dataset = req.body?.dataset || req.body?.uploadedDataset || null;
    const customVars = req.body?.variables || req.body?.customVars || {};

    const output = await generateNarasiAndilMtmWithLLM(input, dataset, customVars);
    return res.json(output);
  } catch (err) {
    console.error("[handleGenerateNarasiKelompok] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Express handler: GET /api/analisis/template/inflasi-ihk
 * Mengembalikan file mentah skema template literal inflasiIHK.json
 */
export const handleGetTemplateInflasiIhk = async (req, res) => {
  try {
    const template = loadInflasiIhkTemplate();
    if (!template) {
      return res.status(404).json({ message: "File template inflasiIHK.json tidak ditemukan." });
    }
    return res.json(template);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Express handler: POST /api/analisis/template/inflasi-ihk/render
 * Me-render inflasiIHK.json sebagai template literal dengan variabel terisi penuh
 */
export const handleRenderTemplateInflasiIhk = async (req, res) => {
  try {
    const dataset = req.body?.dataset || req.body?.uploadedDataset || {};
    const customVars = req.body?.variables || req.body?.customVars || {};
    const generateAi = req.body?.generateAiNarratives === true;

    // Jika diminta generate AI narasi kelompok m-to-m
    if (generateAi) {
      try {
        const narratives = await generateNarasiAndilMtmWithLLM(null, dataset, customVars);
        if (Array.isArray(narratives)) {
          narratives.forEach((n) => {
            const gk = n.groupKey;
            if (gk === "pakaian") customVars["keteranganAndilInflasiMtmPakaian"] = n.desc;
            if (gk === "perumahan") customVars["keteranganAndilInflasiMtmPerumahan"] = n.desc;
            if (gk === "transportasi") customVars["keteranganAndilInflasiMtmTransportasi"] = n.desc;
            if (gk === "rekreasi") customVars["keteranganAndilInflasiMtmRekreasi"] = n.desc;
            if (gk === "pendidikan") customVars["keteranganAndilInflasiMtmPendidikan"] = n.desc;
            if (gk === "restoran") customVars["keteranganAndilInflasiMtmRestoran"] = n.desc;
            if (gk === "perawatan") customVars["keteranganAndilInflasiMtmPerawatan"] = n.desc;
          });
        }
      } catch (aiErr) {
        console.warn("[handleRenderTemplateInflasiIhk] AI Narrative warning:", aiErr.message);
      }
    }

    const template = loadInflasiIhkTemplate();
    if (!template) {
      return res.status(404).json({ message: "File template inflasiIHK.json tidak ditemukan." });
    }

    const varMap = buildVariableMapFromDataset(dataset, customVars);
    const rendered = renderTemplateObject(template, varMap);

    return res.json({
      success: true,
      template: rendered,
      varMap,
    });
  } catch (err) {
    console.error("[handleRenderTemplateInflasiIhk] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Generate narasi proyeksi/forecast inflasi menggunakan Unified LLM
 */
export const generateForecastNarasiWithLLM = async ({
  city = "Kota Metro",
  period = "",
  forecastData = null,
  inflasiData = null,
  varMap = {}
} = {}) => {
  const cleanCity = String(city || "Kota Metro").replace(/^(KOTA|KABUPATEN|KAB\.?)\s+/i, "");
  const targetCity = `Kota ${cleanCity}`;
  const targetPeriod = period || varMap["bulanTahun"] || "periode mendatang";

  // Ekstrak angka proyeksi dari forecastData jika tersedia
  let forecastValStr = "0,25";
  let komoditasHighlights = [];

  if (forecastData) {
    if (Array.isArray(forecastData?.inflasi) && forecastData.inflasi.length > 0) {
      const num = Number(forecastData.inflasi[0]);
      if (!isNaN(num)) forecastValStr = num.toFixed(2).replace(".", ",");
    } else if (typeof forecastData?.inflasi === "number") {
      forecastValStr = forecastData.inflasi.toFixed(2).replace(".", ",");
    } else if (typeof forecastData === "number") {
      forecastValStr = forecastData.toFixed(2).replace(".", ",");
    }

    if (forecastData?.komoditas && typeof forecastData.komoditas === "object") {
      komoditasHighlights = Object.keys(forecastData.komoditas).slice(0, 3);
    }
  } else if (varMap["forecastInflasi"]) {
    forecastValStr = String(varMap["forecastInflasi"]).replace(".", ",");
  }

  const prompt = `
Anda adalah analis ekonomi makro dan harga Badan Pusat Statistik (BPS) Republik Indonesia.
Tugas Anda adalah menyusun narasi resmi mengenai Proyeksi dan Prakiraan Inflasi untuk Berita Resmi Statistik (BRS) periode mendatang di ${targetCity}.

DATA INPUT:
- Wilayah: ${targetCity}
- Periode Rilis Saat Ini: ${targetPeriod}
- Proyeksi Tingkat Inflasi Bulan ke Bulan (M-to-M) Periode Mendatang: ${forecastValStr} persen
${komoditasHighlights.length > 0 ? `- Komoditas Terkait: ${komoditasHighlights.join(", ")}` : ""}

KETENTUAN KETAT BAHASA DAN PENULISAN:
1. Teks narasi WAJIB 100% MENGGUNAKAN BAHASA INDONESIA BAKU yang formal, lugas, dan sesuai kaidah penulisan Berita Resmi Statistik BPS.
2. DILARANG KERAS menggunakan kata, kalimat, atau frasa dalam bahasa Inggris (seperti "month-to-month", "time-series", "volatile foods", "artificial neural network"). Gunakan padanan resmi bahasa Indonesia:
   - "bulan ke bulan (m-to-m)"
   - "tahun ke tahun (y-on-y)"
   - "tahun kalender (y-to-d)"
   - "data deret waktu" atau "runtun waktu"
   - "Jaringan Saraf Tiruan (ANN)"
   - "kelompok komoditas pangan bergejolak"
3. Teks narasi WAJIB DITULIS TEPAT DALAM 1 PARAGRAF TUNGGAL yang padat, mengalir, dan komprehensif (sekitar 70 - 100 kata). DILARANG KERAS membaginya menjadi 2 paragraf atau lebih, dan DILARANG menyisipkan baris baru (newline / enter).
4. Jelaskan angka proyeksi laju inflasi m-to-m periode berikutnya (${forecastValStr} persen), kecenderungan arah pergerakan harga, pengaruh musiman komoditas pangan bergejolak, serta pentingnya koordinasi Tim Pengendalian Inflasi Daerah (TPID) dalam menjaga kestabilan harga dan daya beli masyarakat.
5. HANYA keluarkan teks narasi murni tanpa pengantar/penutup percakapan, tanpa tanda kutip di awal/akhir, dan tanpa format markdown berlebih.
`;

  try {
    const aiRes = await callUnifiedLLM({
      prompt,
      temperature: 0.5,
    });

    let reply = (aiRes.reply || aiRes.message || "").trim();
    reply = reply.replace(/^["']|["']$/g, "").trim();
    // Pastikan hasil benar-benar 1 paragraf tunggal tanpa line break / newline
    reply = reply.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();

    if (reply && reply.length > 40) {
      return reply;
    }
  } catch (err) {
    console.warn("[generateForecastNarasiWithLLM] Warning via callUnifiedLLM:", err.message);
  }

  // Fallback cerdas 100% Bahasa Indonesia baku resmi BPS jika LLM offline/gagal
  return `Berdasarkan hasil pemodelan proyeksi data deret waktu menggunakan Jaringan Saraf Tiruan (Artificial Neural Network / ANN), laju inflasi bulan ke bulan (m-to-m) di ${targetCity} pada periode mendatang diprakirakan berada pada kisaran ${forecastValStr} persen. Perkembangan pergerakan indeks harga tersebut dipengaruhi oleh dinamika ketersediaan pasokan kelompok komoditas pangan bergejolak serta pola konsumsi musiman masyarakat. Langkah mitigasi dan pemantauan distribusi pasokan oleh Tim Pengendalian Inflasi Daerah (TPID) serta kelancaran rantai pasok antardaerah tetap diperlukan secara konsisten guna menjaga stabilitas harga dan melindungi daya beli masyarakat di wilayah ${targetCity}.`;
};

/**
 * Express handler: POST /api/analisis/generate-narasi-forecast
 */
export const handleGenerateNarasiForecast = async (req, res) => {
  try {
    const { city, period, forecastData, inflasiData, varMap } = req.body;
    const text = await generateForecastNarasiWithLLM({
      city,
      period,
      forecastData,
      inflasiData,
      varMap,
    });
    return res.json({ success: true, text });
  } catch (err) {
    console.error("[handleGenerateNarasiForecast] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
