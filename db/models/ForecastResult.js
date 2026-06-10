import mongoose from "mongoose";

const ForecastResultSchema = new mongoose.Schema(
  {
    kota: {
      type: String,
      required: true,
      unique: true, // Only one active forecast per city
    },
    regionVal_ihk: String,
    regionVal_inflasi: String,
    forecast: {
      inflasi: {
        historical_series: [Number],
        forecast_value: Number,
        loss_history: [Number],
        final_loss: Number,
        train_predictions: [Number],
        actual_targets: [Number]
      },
      ihk: {
        historical_series: [Number],
        forecast_value: Number,
        loss_history: [Number],
        final_loss: Number,
        train_predictions: [Number],
        actual_targets: [Number]
      },
      komoditas: mongoose.Schema.Types.Mixed,
    },
    hyperparameters: {
      lag: Number,
      epochs: Number,
      batch_size: Number,
      learning_rate: Number,
      dropout_rate: Number,
      hidden_neurons: [Number]
    }
  },
  { 
    timestamps: true 
  }
);

export default mongoose.model("ForecastResult", ForecastResultSchema);
