import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface VoiceVisualizerProps {
  isActive: boolean;
}

export function VoiceVisualizer({ isActive }: VoiceVisualizerProps) {
  const [bars, setBars] = useState<number[]>(new Array(20).fill(10));

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setBars(prev => prev.map(() => Math.random() * 40 + 10));
    }, 100);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <div className="flex items-center justify-center gap-1 h-20" data-testid="voice-visualizer">
      {bars.map((height, i) => (
        <motion.div
          key={i}
          className="w-1 bg-primary rounded-full"
          animate={{ height: isActive ? height : 5, opacity: isActive ? 1 : 0.3 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
      ))}
    </div>
  );
}
