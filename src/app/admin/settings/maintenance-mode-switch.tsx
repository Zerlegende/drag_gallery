"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";

export function MaintenanceModeSwitch() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  // Wartungsmodus-Status beim Laden abrufen
  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch("/api/admin/maintenance");
        const data = await response.json();
        setMaintenanceMode(data.maintenanceMode);
      } catch (error) {
        console.error("Error fetching maintenance mode:", error);
      }
    }
    fetchStatus();
  }, []);

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: checked }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update maintenance mode");
      }

      const data = await response.json();
      setMaintenanceMode(data.maintenanceMode);

      showToast(
        "success",
        checked
          ? "Wartungsmodus aktiviert - Normale Nutzer können sich nicht mehr einloggen."
          : "Wartungsmodus deaktiviert - Alle Nutzer können sich wieder einloggen."
      );
    } catch (error) {
      console.error("Error updating maintenance mode:", error);
      showToast(
        "error",
        error instanceof Error ? error.message : "Wartungsmodus konnte nicht geändert werden."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center space-x-3">
      <Checkbox
        id="maintenance-mode"
        checked={maintenanceMode}
        onCheckedChange={handleToggle}
        disabled={isLoading}
      />
      <div className="space-y-1">
        <Label
          htmlFor="maintenance-mode"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Wartungsmodus
        </Label>
        <p className="text-sm text-muted-foreground">
          Wenn aktiviert, können sich nur Admins einloggen. Normale Nutzer sehen einen Wartungsbildschirm.
        </p>
      </div>
    </div>
  );
}
