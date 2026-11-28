import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";

type InfoPage = "about" | "contact" | "faq";
const pageContent: Record<InfoPage, { eyebrow: string; title: string; intro: string; sections: Array<[string, string]> }> = {
  about: { eyebrow: "About us", title: "Practical resources to help you learn and move forward", intro: "Money Tree Venture offers downloadable PDF guides, Starter Kits, Bundles and separate 1:1 Call Guidance to explore digital skills and new ideas.", sections: [["Our approach", "Read each resource at your own pace and use it for your learning goals. Exact product details are provided on its page."], ["What you’ll find", "Individual PDF guides, Starter Kits and Bundles with multiple PDFs, plus 1:1 Call Guidance with a separate booking workflow. Check each listing for availability and included content."]] },
  contact: { eyebrow: "Contact", title: "Get in touch", intro: "Need help with an order, PDF access or 1:1 Call Guidance? Contact instructions will be published after owner confirmation.", sections: [["Support channel", "The official support email or contact form is awaiting owner confirmation. Add a verified support channel and response process before publishing."], ["Order-related help", "Sharing an order reference can be helpful when asking for support. Never share your password, payment credentials or sensitive personal details."]] },
  faq: { eyebrow: "Help", title: "Frequently asked questions", intro: "Find answers about our products, digital access and 1:1 Call Guidance. Each product page lists what is included.", sections: [["What products are available?", "Browse individual PDF guides, PDF Starter Kits, PDF Bundles and separately offered 1:1 Call Guidance. See each product page for its contents and price."], ["Where can I find my PDF after purchase?", "After payment is verified and your purchase is ready, eligible PDFs appear in My Library. Contact support if you need help accessing a purchase."], ["How do I schedule Call Guidance?", "After an eligible purchase, open Bookings in your account to share your preferred time and review its status. Your appointment is confirmed only when the booking shows a confirmed status."], ["Where can I find the refund policy?", "Read the Refund & Cancellation Policy before placing an order. Contact support if you have a question about a specific purchase."]] },
};

export function LocalizedInfoPage({ page }: { page: InfoPage }) {
  const content = pageContent[page];
  return <>
    <Navbar />
    <main className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <header className="max-w-3xl border-l-2 border-accent pl-5 sm:pl-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-secondary">{content.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">{content.title}</h1>
          <p className="mt-5 text-base leading-7 text-foreground-secondary sm:text-lg sm:leading-8">{content.intro}</p>
        </header>
        <div className="mt-10 divide-y divide-border border-y border-border">
          {content.sections.map(([title, body]) => <section key={title} className="py-7 sm:py-8"><h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2><p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-7 text-foreground-secondary sm:text-base">{body}</p></section>)}
        </div>
      </div>
    </main>
    <Footer />
  </>;
}
