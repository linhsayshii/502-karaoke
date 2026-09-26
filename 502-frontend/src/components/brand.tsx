import { MicVocalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const APP_NAME = "Karaoke 502";

// The app logo: a microphone in a rounded square (same as the favicon).
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <MicVocalIcon className="size-4" />
    </div>
  );
}
