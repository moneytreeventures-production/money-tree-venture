import type { Metadata } from "next";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import CartPage from "@/components/cart/cart-page";

export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: false } };

export default function CartRoute() {
  return (
    <>
      <Navbar />
      <CartPage />
      <Footer />
    </>
  );
}
