import { useQuery } from "@tanstack/react-query";

interface DashboardStats {
  todaysLiens: number;
  airtableSynced: number;
  totalProcessed: number;
  pendingSync: number;
}

export function StatusCards() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-pulse">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-16"></div>
              </div>
              <div className="w-12 h-12 bg-slate-200 rounded-full"></div>
            </div>
            <div className="flex items-center mt-4">
              <div className="h-4 bg-slate-200 rounded w-12 mr-2"></div>
              <div className="h-4 bg-slate-200 rounded w-20"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6">
          <div className="text-red-600">Failed to load dashboard statistics</div>
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Records Found",
      value: stats.todaysLiens,
      icon: "fas fa-file-medical",
      color: "emerald",
      change: stats.todaysLiens > 0 ? "Active" : "No activity",
      changeLabel: "today"
    },
    {
      label: "Synced to Airtable",
      value: stats.airtableSynced,
      icon: "fas fa-sync",
      color: "blue",
      change: stats.airtableSynced > 0 ? "Synced" : "Pending",
      changeLabel: "status"
    },
    {
      label: "Total Processed",
      value: stats.totalProcessed || stats.todaysLiens,
      icon: "fas fa-database",
      color: "amber",
      change: "All time",
      changeLabel: "records"
    },
    {
      label: "PDFs Downloaded",
      value: stats.todaysLiens,
      icon: "fas fa-download",
      color: "purple",
      change: "Complete",
      changeLabel: "with PDFs"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6" data-testid={`card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium" data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-label`}>
                {card.label}
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1" data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-value`}>
                {card.value}
              </p>
            </div>
            <div className={`w-12 h-12 bg-${card.color}-100 rounded-full flex items-center justify-center`}>
              <i className={`${card.icon} text-${card.color}-600`}></i>
            </div>
          </div>
          <div className="flex items-center mt-4">
            <span className={`text-${card.color}-600 text-sm font-medium`} data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-change`}>
              {card.change}
            </span>
            <span className="text-slate-500 text-sm ml-2">
              {card.changeLabel}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
