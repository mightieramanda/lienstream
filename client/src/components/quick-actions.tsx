import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function QuickActions() {
  const { toast } = useToast();

  const handleAirtableSync = async () => {
    try {
      const response = await fetch('/api/automation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to trigger sync');
      }
      
      toast({
        title: "Sync Started",
        description: "Automation has been triggered to sync records to Airtable.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start sync process.",
        variant: "destructive"
      });
    }
  };

  const handleDownloadReport = () => {
    window.open('/api/liens/export', '_blank');
    toast({
      title: "Export Started",
      description: "Downloading lien records as CSV.",
    });
  };

  const handleViewLogs = () => {
    toast({
      title: "View Logs",
      description: "This feature will be implemented to show detailed system activity logs.",
    });
  };

  const handleRefresh = () => {
    window.location.reload();
    toast({
      title: "Refreshing",
      description: "Dashboard data is being refreshed.",
    });
  };

  const actions = [
    {
      title: "Run Automation",
      description: "Start scraping process",
      icon: "fas fa-play",
      color: "blue",
      onClick: handleAirtableSync,
      testId: "run-automation"
    },
    {
      title: "Export Data",
      description: "Download records",
      icon: "fas fa-download",
      color: "emerald",
      onClick: handleDownloadReport,
      testId: "export-data"
    },
    {
      title: "View Logs",
      description: "System activity",
      icon: "fas fa-list",
      color: "amber",
      onClick: handleViewLogs,
      testId: "view-logs"
    },
    {
      title: "Refresh Data",
      description: "Update dashboard",
      icon: "fas fa-sync",
      color: "purple",
      onClick: handleRefresh,
      testId: "refresh-data"
    }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800">Quick Actions</h3>
      </div>
      <div className="p-6 space-y-4">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            className={`w-full text-left p-4 rounded-lg border border-slate-200 hover:border-${action.color}-300 hover:bg-${action.color}-50 transition-colors`}
            data-testid={`button-${action.testId}`}
          >
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 bg-${action.color}-100 rounded-lg flex items-center justify-center`}>
                <i className={`${action.icon} text-${action.color}-600 text-sm`}></i>
              </div>
              <div>
                <h4 className="font-medium text-slate-800">{action.title}</h4>
                <p className="text-slate-500 text-sm">{action.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
