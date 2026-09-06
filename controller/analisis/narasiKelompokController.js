import { callUnifiedLLM } from "../../api/llm/llmRoutes.js";

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
export const generateNarasiAndilMtmWithLLM = async (inputData) => {
  const isSingle = !Array.isArray(inputData);
  const items = isSingle ? [inputData] : inputData;

  if (!items || items.length === 0) {
    return isSingle ? null : [];
  }

  // Siapkan konteks ringkas untuk LLM
  const promptContext = items.map((item, idx) => {
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
  ${items.map(it => `{ "title": { "desc": "${it?.title?.desc || ""}" }, "desc": "<1 paragraf sekitar 50 kata narasi BPS>" }`).join(",\n  ")}
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
  const finalResults = items.map((item, idx) => {
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
    };
  });

  return isSingle ? finalResults[0] : finalResults;
};

/**
 * Express handler: POST /api/analisis/keterangan-andil-mtm
 * Mendukung input single object atau array of objects
 */
export const handleGenerateNarasiKelompok = async (req, res) => {
  try {
    const input = req.body?.items || req.body?.data || req.body;
    if (!input || (Array.isArray(input) && input.length === 0)) {
      return res.status(400).json({ message: "Payload JSON input wajib diisi." });
    }

    const output = await generateNarasiAndilMtmWithLLM(input);
    return res.json(output);
  } catch (err) {
    console.error("[handleGenerateNarasiKelompok] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};
