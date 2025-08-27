import { StatusCards } from "@/components/status-cards";
import { AutomationStatus } from "@/components/automation-status";
import { RecentLiensTable } from "@/components/recent-liens-table";
import { SystemLogs } from "@/components/system-logs";
import { ScheduleSettings } from "@/components/schedule-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function Dashboard() {
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const handleManualTrigger = async () => {
    try {
      const response = await fetch('/api/automation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to trigger automation');
      }
      
      toast({
        title: "Automation Started",
        description: `Searching for liens from ${fromDate} to ${toDate}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start automation",
        variant: "destructive"
      });
    }
  };

  return (
    <main className="flex-1 overflow-auto bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="px-6 py-6">
          {/* Title Section */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-slate-800 mb-2">Dashboard</h2>
            <p className="text-base text-slate-600">Real-time monitoring and control center for medical lien automation</p>
          </div>
          
          {/* Date Range Controls */}
          <div className="flex flex-wrap items-center gap-4 bg-slate-50 rounded-lg p-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <label htmlFor="from-date" className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                  From Date:
                </label>
                <Input
                  id="from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  max={toDate}
                  className="w-44 bg-white"
                  data-testid="input-from-date"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <label htmlFor="to-date" className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                  To Date:
                </label>
                <Input
                  id="to-date"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  min={fromDate}
                  className="w-44 bg-white"
                  data-testid="input-to-date"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleManualTrigger}
              className="ml-auto bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-5 py-2.5 rounded-lg font-medium flex items-center space-x-2 shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30"
              data-testid="button-run-now"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Start Automation</span>
            </Button>
          </div>
        </div>
      </header>
      
      {/* Dashboard Content */}
      <div className="p-6 space-y-8">
        {/* Section 1: Key Metrics - Most important info at the top */}
        <section>
          <StatusCards />
        </section>
        
        {/* Section 2: Automation Controls - Primary actions and status */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-1 bg-blue-600 rounded-full"></div>
            <h3 className="text-lg font-semibold text-slate-800">Automation Controls</h3>
          </div>
          <AutomationStatus />
        </section>
        
        {/* Section 3: Recent Activity - Important for monitoring */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-1 bg-green-600 rounded-full"></div>
            <h3 className="text-lg font-semibold text-slate-800">Recent Activity</h3>
          </div>
          <RecentLiensTable />
        </section>
        
        {/* Section 4: Configuration & Monitoring - Less frequently accessed */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-1 bg-purple-600 rounded-full"></div>
            <h3 className="text-lg font-semibold text-slate-800">Configuration & Monitoring</h3>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ScheduleSettings />
            <div className="xl:col-span-1">
              <SystemLogs />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
