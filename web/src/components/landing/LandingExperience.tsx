"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function LandingExperience({ rateEntries }: { rateEntries: [string, number][] }) {
  const containerRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const { theme, setTheme } = useTheme();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Apply a spring to the scroll progress to make it super smooth (cinematic)
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 50,
    damping: 20,
    restDelta: 0.001
  });

  // Ball Trajectory Map
  const ballX = useTransform(smoothProgress, 
    [0, 0.2, 0.4, 0.6, 0.8, 1], 
    ["25vw", "-25vw", "25vw", "-25vw", "0vw", "0vw"]
  );
  
  const ballY = useTransform(smoothProgress, 
    [0, 0.2, 0.4, 0.6, 0.8, 1], 
    ["5vh", "20vh", "-10vh", "25vh", "0vh", "25vh"]
  );

  const ballScale = useTransform(smoothProgress, 
    [0, 0.2, 0.4, 0.6, 0.8, 1], 
    [1.4, 0.8, 1, 0.7, 1.8, 1.2]
  );

  const ballRotate = useTransform(smoothProgress, [0, 1], [0, 1440]);
  const ballOpacity = useTransform(smoothProgress, [0, 0.8, 1], [1, 0.9, 0.3]);

  // Handle subtle mouse parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse pos to -1 to 1
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      setMousePos({ x, y });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div ref={containerRef} className={`${theme === 'light' ? 'bg-[#f5f8f6] text-[#142019]' : 'bg-[#050914] text-white'} selection:bg-[#32A45E] selection:text-white font-sans overflow-x-hidden`}>
      <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle light and dark mode" className="fixed right-5 top-5 z-50 rounded-full border border-white/15 bg-black/25 p-2.5 text-white/80 backdrop-blur-md transition-colors hover:bg-black/40 hover:text-white">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      
      {/* 3D PICKLEBALL - THE STORYTELLING THREAD */}
      <motion.div 
          className="fixed top-1/2 left-1/2 w-[400px] h-[400px] md:w-[600px] md:h-[600px] pointer-events-none z-30 mix-blend-screen flex items-center justify-center -mt-[200px] -ml-[200px] md:-mt-[300px] md:-ml-[300px]"
          style={{ 
            x: ballX, 
            y: ballY, 
            scale: ballScale, 
            rotate: ballRotate,
            opacity: ballOpacity,
            translateX: mousePos.x * -20,
            translateY: mousePos.y * -20
          }}
        >
        <Image
          src="/pickleball.webp"
          alt="3D Pickleball"
          fill
          sizes="(max-width: 768px) 400px, 600px"
          className="object-contain"
          priority
        />
      </motion.div>

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 px-8 py-6 flex justify-between items-center z-50 mix-blend-difference pointer-events-none">
        <div className="flex items-center">
          <Image 
            src="/secondary-logo.svg" 
            alt="Paddle Point" 
            width={320} height={206} 
            sizes="(max-width: 768px) 220px, 320px"
            className="h-28 md:h-36 w-auto max-w-[320px] md:max-w-[360px] grayscale brightness-0 invert transition-all duration-300"
          />
        </div>
        <nav className="flex gap-6 items-center pointer-events-auto">
          {/* <Link href="/login" className="text-sm font-semibold uppercase tracking-widest hover:text-[#32A45E] transition-colors text-white">
            Staff
          </Link> */}
          <Link href="/booking" className="flex items-center justify-center rounded-full bg-white text-[#050914] hover:bg-[#32A45E] hover:text-white uppercase font-bold tracking-widest px-8 py-6 transition-colors">
            Book Now
          </Link>
        </nav>
      </header>

      {/* BACKGROUND COURT LINES */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03]">
        {/* Abstract court geometry */}
        <div className="absolute top-0 bottom-0 left-[20%] w-[2px] bg-white" />
        <div className="absolute top-0 bottom-0 right-[20%] w-[2px] bg-white" />
        <div className="absolute top-[50%] left-0 right-0 h-[4px] bg-white" />
      </div>

      <main className="relative z-10 flex flex-col">
        
        {/* SECTION 1: HERO */}
        <section className="h-[120vh] flex flex-col justify-center px-8 md:px-24">
          <div className="max-w-5xl">
            <h1 className="text-[5rem] md:text-[8rem] lg:text-[10rem] font-black uppercase leading-[0.85] tracking-tighter drop-shadow-2xl">
              Play<br/>
              Without<br/>
              <span className="text-[#32A45E]">Waiting.</span>
            </h1>
            <p className="mt-12 text-2xl md:text-3xl font-medium max-w-2xl text-white/70">
              Solano's premier self-service pickleball destination. Tap in, select your time, and hit the courts instantly.
            </p>
          </div>
        </section>

        {/* SECTION 2: TAP IN */}
        <section className="h-[120vh] flex flex-col justify-center items-end px-8 md:px-24 text-right">
          <div className="max-w-2xl">
            <div className="text-[8rem] md:text-[12rem] font-black leading-none tracking-tighter opacity-10 mb-[-60px]">01</div>
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tight text-white mb-6">Tap In</h2>
            <p className="text-2xl md:text-3xl font-medium text-white/70">
              Scan your member card at our lobby kiosk. Our system recognizes you instantly. No desk staff required.
            </p>
          </div>
        </section>

        {/* SECTION 3: SELECT TIME */}
        <section className="h-[120vh] flex flex-col justify-center px-8 md:px-24">
          <div className="max-w-2xl">
            <div className="text-[8rem] md:text-[12rem] font-black leading-none tracking-tighter opacity-10 mb-[-60px]">02</div>
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tight text-white mb-6">Select Time</h2>
            <p className="text-2xl md:text-3xl font-medium text-white/70">
              Choose how long you want to play. Your digital wallet balance is deducted automatically.
            </p>
          </div>
        </section>

        {/* SECTION 4: PLAY */}
        <section className="h-[120vh] flex flex-col justify-center items-end px-8 md:px-24 text-right">
          <div className="max-w-2xl">
            <div className="text-[8rem] md:text-[12rem] font-black leading-none tracking-tighter opacity-10 mb-[-60px]">03</div>
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tight text-[#32A45E] mb-6">Play</h2>
            <p className="text-2xl md:text-3xl font-medium text-white/70">
              Watch the live lobby board. Your court is assigned, the lights turn on, and it's game time.
            </p>
          </div>
        </section>

        {/* SECTION 5: RATES & FINAL CTA */}
        <section id="rates" className="min-h-[100vh] flex flex-col justify-center items-center py-32 px-8 text-center relative">
          
          <div className="max-w-4xl w-full z-40">
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-6 text-white drop-shadow-2xl">Court Rates</h2>
            <p className="text-xl md:text-2xl font-medium text-white/50 max-w-2xl mx-auto mb-24 drop-shadow-xl">
              Pay per minute from your digital wallet. Maximum of 4 players per court session.
            </p>
            
            <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto mb-32">
              {rateEntries.map(([min, price]) => (
                <div 
                  key={min} 
                  className="flex justify-between items-center py-6 border-b border-white/10 hover:border-[#32A45E] transition-colors group"
                >
                  <div className="text-3xl md:text-5xl font-bold uppercase tracking-tight text-white/80 group-hover:text-white transition-colors">
                    {min} Mins
                  </div>
                  <div className="text-4xl md:text-6xl font-black tracking-tighter text-white group-hover:text-[#32A45E] transition-colors">
                    ₱{price}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center">
              <Link href="/booking" className="flex items-center justify-center rounded-full bg-[#32A45E] text-white hover:bg-white hover:text-[#050914] transition-all duration-300 uppercase font-black tracking-widest px-16 py-10 text-2xl shadow-[0_0_80px_-10px_rgba(50,164,94,0.6)] hover:shadow-none hover:scale-105">
                Start Playing
              </Link>
            </div>
          </div>
        </section>

      </main>

      <footer className="py-16 bg-[#03060c] text-center flex flex-col items-center gap-8 relative z-40 border-t border-white/5">
        <Image 
          src="/secondary-logo-3.svg" 
          alt="Paddle Point" 
          width={400} height={260} 
          sizes="(max-width: 768px) 240px, 400px"
          className="h-24 md:h-32 w-auto opacity-30 hover:opacity-100 hover:grayscale-0 grayscale brightness-0 invert transition-all duration-500" 
        />
        <p className="text-xs font-bold tracking-widest uppercase text-white/40">
          Solano, Nueva Vizcaya &nbsp;&bull;&nbsp; Est. 2026
        </p>
      </footer>
    </div>
  );
}
