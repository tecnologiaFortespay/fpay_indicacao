import Link from "next/link";
import { buttonVariants } from "./ui/button";

type LinkButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "outline";
  size?: "default" | "sm";
};

// Link com cara de botão, no mesmo sistema dos botões dos formulários.
export function LinkButton({
  href,
  children,
  variant = "outline",
  size = "default",
}: LinkButtonProps) {
  return (
    <Link href={href} className={buttonVariants({ variant, size })}>
      {children}
    </Link>
  );
}
