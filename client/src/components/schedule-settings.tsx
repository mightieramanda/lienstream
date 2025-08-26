import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";

export function ScheduleSettings() {
  const { toast } = useToast();
  const [hour, setHour] = useState("6");
  const [minute, setMinute] = useState("0");
  const [currentSchedule, setCurrentSchedule] = useState("06:00");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchSchedule();
  }, []);

  const fetchSchedule = async () => {
    try {
      const response = await fetch('/api/automation/schedule');
      if (response.ok) {
        const data = await response.json();
        setHour(data.hour.toString());
        setMinute(data.minute.toString());
        setCurrentSchedule(
          `${data.hour.toString().padStart(2, '0')}:${data.minute.toString().padStart(2, '0')}`
        );
      }
    } catch (error) {
      console.error('Failed to fetch schedule:', error);
    }
  };

  const handleUpdateSchedule = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/automation/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          hour: parseInt(hour), 
          minute: parseInt(minute) 
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update schedule');
      }

      const data = await response.json();
      setCurrentSchedule(
        `${data.hour.toString().padStart(2, '0')}:${data.minute.toString().padStart(2, '0')}`
      );

      toast({
        title: "Schedule Updated",
        description: `Automation will now run daily at ${data.humanReadable.replace('daily runs at ', '')}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update schedule",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Schedule Settings</CardTitle>
            <CardDescription>Configure when automation runs daily</CardDescription>
          </div>
          <Clock className="h-5 w-5 text-slate-400" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-sm text-slate-600">Current Schedule</p>
          <p className="text-xl font-semibold text-slate-800">Daily at {currentSchedule}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="hour">Hour</Label>
            <Select value={hour} onValueChange={setHour}>
              <SelectTrigger id="hour" data-testid="select-hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {i.toString().padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="minute">Minute</Label>
            <Select value={minute} onValueChange={setMinute}>
              <SelectTrigger id="minute" data-testid="select-minute">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 60 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {i.toString().padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Button 
          onClick={handleUpdateSchedule}
          disabled={isLoading}
          className="w-full"
          data-testid="button-update-schedule"
        >
          {isLoading ? "Updating..." : "Update Schedule"}
        </Button>
      </CardContent>
    </Card>
  );
}