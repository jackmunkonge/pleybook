"use client";

/* eslint-disable @next/next/no-img-element */
const LAYERS = [
  { src: "shadow", box: "inset-[77.14%_16.11%_12.14%_16.67%]" },
  { src: "folder-back", box: "inset-[29.29%_24.14%_19.29%_22.19%]" },
  { src: "blank-paper", box: "inset-[21.43%_30.83%_27.86%_30.79%]" },
  { src: "folder-front", box: "inset-[48.57%_21.56%_18.93%_17.69%]" },
  { src: "sparkle", box: "inset-[20.36%_19.44%_68.93%_74.17%]" },
];

/** Shown in place of "Recent reviews" before the user has run anything. */
export function EmptyReviews() {
  return (
    <section className="flex flex-col gap-3 lg:gap-4">
      <h2 className="text-xl leading-[26px] font-semibold tracking-[-0.3px]">Recent reviews</h2>
      <div className="flex flex-col items-center gap-6 rounded-[20px] border border-border-default bg-bg-surface p-6 shadow-card lg:flex-row lg:justify-center lg:gap-10 lg:p-10">
        <div aria-hidden className="relative h-[224px] w-[288px] max-w-full shrink-0">
          {LAYERS.map((l) => (
            <div key={l.src} className={`absolute ${l.box}`}>
              <img src={`/empty/${l.src}.svg`} alt="" className="block size-full max-w-none" />
            </div>
          ))}
        </div>
        <div className="flex w-full max-w-[380px] flex-col items-start gap-2.5">
          <p className="font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] text-brand-text uppercase">No reviews yet</p>
          <h3 className="text-xl leading-[26px] font-semibold tracking-[-0.3px]">Your first review will live here</h3>
          <p className="text-sm leading-[22px] text-text-secondary">
            Upload a contract, or run the sample MSA to watch every clause get checked against the playbook.
          </p>
          <button
            type="button"
            onClick={() => {
              const b = document.getElementById("try-sample") as HTMLButtonElement | null;
              b?.scrollIntoView({ behavior: "smooth", block: "center" });
              b?.click();
            }}
            className="rounded-[10px] bg-brand-solid px-4 py-2.5 text-sm leading-5 font-medium text-brand-on-solid hover:opacity-90"
          >
            Try the sample MSA
          </button>
        </div>
      </div>
    </section>
  );
}
