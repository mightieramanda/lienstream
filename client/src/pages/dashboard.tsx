import { StatusCards } from "@/components/status-cards";
import { AutomationStatus } from "@/components/automation-status";
import { QuickActions } from "@/components/quick-actions";
import { RecentLiensTable } from "@/components/recent-liens-table";
import { SystemLogs } from "@/components/system-logs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { toast } = useToast();

  const handleManualTrigger = async () => {
    try {
      const response = await fetch('/api/automation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to trigger automation');
      }
      
      toast({
        title: "Automation Started",
        description: "Manual automation run has been triggered successfully.",
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
    <main className="flex-1 overflow-auto">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
            <p className="text-slate-500 mt-1">Real-time monitoring and control center</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button 
              onClick={handleManualTrigger}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-5 py-2.5 rounded-lg font-medium flex items-center space-x-2 shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30"
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
      <div className="p-6 space-y-6">
        {/* Status Cards */}
        <StatusCards />
        
        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Automation Status */}
          <AutomationStatus />
          
          {/* Quick Actions */}
          <QuickActions />
        </div>
        
        {/* Recent Liens Table */}
        <RecentLiensTable />
        
        {/* System Logs */}
        <SystemLogs />
      </div>
    </main>
  );
}
