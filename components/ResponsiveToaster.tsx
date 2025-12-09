"use client";

import { Toaster } from "sonner";
import { useEffect, useState } from "react";

export default function ResponsiveToaster() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // Check if screen is mobile on mount
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();

        // Add resize listener
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    return <Toaster position={isMobile ? "bottom-center" : "top-center"} />;
}
