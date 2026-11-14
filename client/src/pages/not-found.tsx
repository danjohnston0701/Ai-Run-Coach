import { Link } from "wouter";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-root px-4">
      <div className="text-center">
        <Link href="/" className="inline-block">
          <Logo />
        </Link>
        <div className="num mt-10 text-7xl font-extrabold text-gradient">404</div>
        <h1 className="mt-3 text-xl font-bold text-ink">This page went off route</h1>
        <p className="mt-2 text-sm text-ink-2">The link may be old, or the page has moved.</p>
        <Button asChild className="mt-6">
          <Link href="/">Back to Ai Run Coach</Link>
        </Button>
      </div>
    </div>
  );
}
