import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function QuickActions() {
  const { toast } = useToast();

  const handleAirtableSync = () => {
    toast({
      title: "Airtable Sync",
      description: "This feature will be implemented to manually sync pending records to Airtable.",
    });
  };

  const handleDownloadReport = () => {
    toast({
      title: "Export Report",
      description: "This feature will be implemented to export CSV/Excel reports of lien data.",
    });
  };

  const handleViewLogs = () => {
    toast({
      title: "View Logs",
      description: "This feature will be implemented to show detailed system activity logs.",
    });
  };

  const handleConfigureSchedule = () => {
    toast({
      title: "Schedule Settings",
      description: "This feature will be implemented to configure automation scheduling.",
    });
  };

  const actions = [
    {
      title: "Sync to Airtable",
      description: "Push pending records",
      icon: "fas fa-table",
      color: "blue",
      onClick: handleAirtableSync,
      testId: "sync-airtable"
    },
    {
      title: "Export Report",
      description: "Download CSV/Excel",
      icon: "fas fa-download",
      color: "emerald",
      onClick: handleDownloadReport,
      testId: "export-report"
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
      title: "Schedule Settings",
      description: "Configure automation",
      icon: "fas fa-calendar",
      color: "purple",
      onClick: handleConfigureSchedule,
      testId: "schedule-settings"
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
