import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";

export function ScheduleSettings() {
  const { toast } = useToast();
  const [hour12, setHour12] = useState("6");
  const [minute, setMinute] = useState("0");
  const [period, setPeriod] = useState("AM");
  const [timezone, setTimezone] = useState("PT");
  const [currentSchedule, setCurrentSchedule] = useState("6:00 AM PT");
  const [isLoading, setIsLoading] = useState(false);

  const timezones = [
    { value: "PT", label: "Pacific Time (PT)" },
    { value: "CT", label: "Central Time (CT)" },
    { value: "ET", label: "Eastern Time (ET)" }
  ];

  useEffect(() => {
    fetchSchedule();
  }, []);

  const formatTime12Hour = (hour24: number, minute: number, tz: string) => {
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    return `${hour12}:${minute.toString().padStart(2, '0')} ${period} ${tz}`;
  };

  const fetchSchedule = async () => {
    try {
      const response = await fetch('/api/automation/schedule');
      if (response.ok) {
        const data = await response.json();
        const hour24 = data.hour;
        const isPM = hour24 >= 12;
        const hour12Value = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
        
        setHour12(hour12Value.toString());
        setMinute(data.minute.toString());
        setPeriod(isPM ? "PM" : "AM");
        setTimezone(data.timezone || "PT");
        setCurrentSchedule(formatTime12Hour(hour24, data.minute, data.timezone || "PT"));
      }
    } catch (error) {
      console.error('Failed to fetch schedule:', error);
    }
  };

  const handleUpdateSchedule = async () => {
    setIsLoading(true);
    try {
      // Convert 12-hour format to 24-hour
      let hour24 = parseInt(hour12);
      if (period === "PM" && hour24 !== 12) {
        hour24 += 12;
      } else if (period === "AM" && hour24 === 12) {
        hour24 = 0;
      }

      const response = await fetch('/api/automation/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          hour: hour24, 
          minute: parseInt(minute),
          timezone: timezone
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update schedule');
      }

      const data = await response.json();
      setCurrentSchedule(formatTime12Hour(data.hour, data.minute, data.timezone || timezone));

      toast({
        title: "Schedule Updated",
        description: `Automation will now run daily at ${formatTime12Hour(data.hour, data.minute, data.timezone || timezone)}`,
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
        
        <div className="space-y-4">
          {/* Time Selection */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="hour">Hour</Label>
              <Select value={hour12} onValueChange={setHour12}>
                <SelectTrigger id="hour" data-testid="select-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {i + 1}
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
                  {['00', '15', '30', '45'].map((min) => (
                    <SelectItem key={min} value={parseInt(min).toString()}>
                      {min}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="period">AM/PM</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger id="period" data-testid="select-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Timezone Selection */}
          <div className="space-y-2">
            <Label htmlFor="timezone">Time Zone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone" data-testid="select-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
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