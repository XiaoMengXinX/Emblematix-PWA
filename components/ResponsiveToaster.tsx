"use client";

import { Toaster } from "sonner";

export default function ResponsiveToaster() {
    return (
        <Toaster
            position="top-center"
            duration={1500}
            richColors
        />
    );
}
