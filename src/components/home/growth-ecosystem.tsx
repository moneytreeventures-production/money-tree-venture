import { BookOpen, Compass, Lightbulb, PencilRuler, Sprout } from "lucide-react";

const leaves = [
  { className: "left-[6%] top-[12%]", icon: BookOpen, title: "Knowledge", detail: "Explore guides" },
  { className: "right-[5%] top-[10%]", icon: PencilRuler, title: "Digital skills", detail: "Build understanding" },
  { className: "left-[3%] top-[48%]", icon: Lightbulb, title: "Practice", detail: "Try new ideas" },
  { className: "right-[3%] top-[49%]", icon: Compass, title: "New paths", detail: "Choose your way" },
] as const;

const branches = [
  "M300 430 C300 344 300 268 300 175",
  "M300 290 C256 265 203 226 141 151",
  "M300 259 C349 228 402 178 465 137",
  "M300 355 C237 330 183 317 108 287",
  "M300 338 C358 314 416 298 493 281",
] as const;

export default function GrowthEcosystem() {
  return <div data-growth-ecosystem aria-hidden="true" className="relative mx-auto aspect-[1.08/1] w-full max-w-[610px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f1e36] shadow-[0_28px_65px_-42px_rgba(15,30,54,0.8)] sm:aspect-[1.18/1]">
    <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:14%_14%]" />
    <div className="absolute left-[7%] top-[5%] flex items-center gap-2 text-[9px] font-bold tracking-[0.15em] text-orange-200 sm:text-[10px]"><span className="size-1.5 rounded-full bg-orange-400" /> THE GROWTH MAP</div>

    <svg viewBox="0 0 600 520" className="absolute inset-0 size-full" fill="none" preserveAspectRatio="xMidYMid meet" focusable="false">
      <circle cx="300" cy="297" r="139" stroke="white" strokeOpacity=".08" />
      <circle cx="300" cy="297" r="204" stroke="white" strokeOpacity=".05" />
      {branches.map((path, index) => <g key={path}>
        <path d={path} stroke="#ffc18d" strokeOpacity=".28" strokeWidth="2" strokeLinecap="round" />
        <path className="mt-growth-path" style={{ animationDelay: `${index * 75}ms` }} pathLength="1" d={path} stroke="#fb923c" strokeOpacity=".85" strokeWidth="2" strokeLinecap="round" />
      </g>)}
      <path d="M300 430 C267 453 243 465 214 477 M300 430 C330 453 359 464 389 477" stroke="#ffc18d" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
      <circle cx="300" cy="295" r="7" fill="#fb923c" />
      <circle cx="300" cy="295" r="18" fill="#fb923c" fillOpacity=".12" />
      <circle cx="141" cy="151" r="5" fill="#fb923c" />
      <circle cx="465" cy="137" r="5" fill="#fb923c" />
      <circle cx="108" cy="287" r="5" fill="#fb923c" />
      <circle cx="493" cy="281" r="5" fill="#fb923c" />
    </svg>

    {leaves.map(({ className, icon: Icon, title, detail }) => <div key={title} className={`absolute flex min-w-[38%] items-start gap-2 rounded-xl border border-white/15 bg-[#182b46]/95 p-2.5 text-white shadow-lg shadow-black/10 sm:min-w-[34%] sm:gap-3 sm:p-3.5 ${className}`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-400/15 text-orange-200 sm:size-9"><Icon size={17} strokeWidth={1.7} /></span>
      <span className="min-w-0"><span className="block text-[11px] font-semibold leading-4 sm:text-sm">{title}</span><span className="mt-0.5 hidden text-[10px] leading-4 text-slate-300 sm:block sm:text-xs">{detail}</span></span>
    </div>)}

    <div className="absolute bottom-[6%] left-1/2 flex w-[51%] -translate-x-1/2 items-center justify-center gap-2 rounded-full border border-orange-300/40 bg-[#26354a] px-3 py-2 text-center text-[10px] font-semibold text-white shadow-lg sm:w-[45%] sm:py-2.5 sm:text-xs">
      <Sprout size={17} className="shrink-0 text-orange-300" /> Start with an idea
    </div>
  </div>;
}
