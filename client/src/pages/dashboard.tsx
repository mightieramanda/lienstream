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
            <p className="text-slate-500 mt-1">Monitor lien records and automation status</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button 
              onClick={handleManualTrigger}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2"
              data-testid="button-run-now"
            >
              <i className="fas fa-play text-sm"></i>
              <span>Run Now</span>
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
