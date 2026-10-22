import { brand } from "@/config/brand";

/** Logotipo tipográfico: PALACE (Prata) + HAIR EXTENSIONS (Figtree, oro champaña). */
export function Wordmark({ size = "md", align = "left" }: { size?: "sm" | "md" | "lg"; align?: "left" | "center" }) {
  const main = { sm: "text-lg", md: "text-xl", lg: "text-3xl" }[size];
  const sub = { sm: "text-[6.5px]", md: "text-[7.5px]", lg: "text-[10px]" }[size];
  return (
    <div className={align === "center" ? "text-center" : ""} aria-label={brand.name} role="img">
      <div className={`font-display tracking-[0.1em] text-fg ${main}`} aria-hidden>
        {brand.wordmark}
      </div>
      <div className={`mt-0.5 font-medium tracking-[0.38em] text-gold ${sub}`} aria-hidden>
        {brand.descriptor}
      </div>
    </div>
  );
}
