// import mongoose from "mongoose";

// const productSchema = new mongoose.Schema({
//   vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
//   name: String,
//   price: Number,
//   description: String,
// });

// const Product = mongoose.model("Product", productSchema);

// export default Product;


import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
  },
  name: String,
  price: Number,
  description: String,
  category: String,
  stock: Number,
  averageRating: Number,
  salesCount: Number,
  cartAdds: Number,
  createdAt: Date,
});

export default mongoose.model("Product", productSchema);
