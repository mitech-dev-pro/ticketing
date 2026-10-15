import type { ReactNode } from 'react';
import Image from 'next/image';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-navy px-8 py-10 text-white md:px-12 md:py-14">
        <Image
          src="/milife-symbol-t.png"
          alt=""
          aria-hidden
          width={512}
          height={512}
          className="pointer-events-none absolute -bottom-24 -left-24 opacity-10"
        />

        <Image
          src="/milife-lockup-white.png"
          alt="miLife Insurance"
          width={140}
          height={62}
          priority
        />

        <div className="relative flex max-w-md flex-col gap-4">
          <p className="label-mono text-teal">Service desk</p>
          <h1 className="text-4xl leading-tight font-bold">One desk for every department.</h1>
          <p className="text-body text-white/70">
            Send a request to IT, HR, Finance, Claims or any team, and follow it all the way to
            resolved.
          </p>
        </div>

        <p className="relative text-small text-white/50">
          miLife Insurance Company Ltd · For staff use only
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-bg px-8 py-14">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
  );
}
