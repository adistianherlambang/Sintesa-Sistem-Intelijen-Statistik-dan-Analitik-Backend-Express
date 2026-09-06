import mongoose from "mongoose";

const AnalysisHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    periode: {
      type: String,
      required: true,
    },
    analysisFile: {
      type: String, // Filename or identifier of the file (DOCX/IDML) saved in filesystem
      default: "",
    },
    docxFile: {
      type: String, // Filename of the DOCX file in export/analysis_files
      default: "",
    },
    pdfFile: {
      type: String, // Filename of the PDF file in export/analysis_files
      default: "",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export default mongoose.model("AnalysisHistory", AnalysisHistorySchema);
