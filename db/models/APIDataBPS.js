import mongoose from "mongoose";

const APIDataBPSSchema = new mongoose.Schema(
  {
    status: String,
    dataAvailability: String,
    lastUpdate: Date,

    subject: Array,
    var: Array,
    turvar: Array,
    labelvervar: String,
    vervar: Array,
    tahun: Array,
    turtahun: Array,

    datacontent: Object,
    yoy: Object,
  },
  { timestamps: true },
);

export default mongoose.model("APIDataBPS", APIDataBPSSchema);
