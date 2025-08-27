import { useQuery } from "@tanstack/react-query";
import { SystemLog } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function SystemLogs() {
  const [logDate, setLogDate] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'date'>('all');
  
  const queryKey = viewMode === 'date' && logDate 
    ? [`/api/logs?date=${logDate}`] 
    : ['/api/logs'];
    
  const { data: logs, isLoading, refetch } = useQuery<SystemLog[]>({
    queryKey,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">System Activity</h3>
            <div className="animate-pulse w-6 h-6 bg-slate-200 rounded"></div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start space-x-3 animate-pulse">
                <div className="w-2 h-2 bg-slate-200 rounded-full mt-2 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">System Activity</h3>
          </div>
        </div>
        <div className="p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-list text-slate-400 text-xl"></i>
          </div>
          <h4 className="text-lg font-medium text-slate-800 mb-2">No activity logs</h4>
          <p className="text-slate-500">System activity logs will appear here once the automation starts running.</p>
        </div>
      </div>
    );
  }

  const getLevelColor = (level: string) => {
    const colors = {
      'success': 'bg-emerald-500',
      'info': 'bg-blue-500',
      'warning': 'bg-amber-500',
      'error': 'bg-red-500'
    };
    return colors[level as keyof typeof colors] || 'bg-slate-500';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Today at ${date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      })}`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">System Activity</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline"
                className="flex items-center justify-center transition-all duration-200 border-blue-500 hover:bg-blue-500 hover:text-white hover:shadow-md"
                onClick={() => { setViewMode('all'); setLogDate(''); }}
                data-testid="button-view-all-logs"
              >
                <i className="fas fa-list mr-1"></i>
                All Logs
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={logDate}
                  onChange={(e) => { setLogDate(e.target.value); setViewMode('date'); }}
                  className="w-36 h-8 text-sm"
                  placeholder="Select date"
                  data-testid="input-log-date"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="flex items-center justify-center w-9 h-9 transition-all duration-200 hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:rotate-180"
              onClick={() => refetch()}
              data-testid="button-refresh-logs"
            >
              <i className="fas fa-sync-alt transition-transform duration-300"></i>
            </Button>
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start space-x-3" data-testid={`log-entry-${log.id}`}>
              <div className={`w-2 h-2 ${getLevelColor(log.level)} rounded-full mt-2 flex-shrink-0`}></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800" data-testid={`text-log-message-${log.id}`}>
                  {log.message}
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <p className="text-xs text-slate-500" data-testid={`text-log-timestamp-${log.id}`}>
                    {formatTimestamp(log.timestamp.toString())}
                  </p>
                  {log.component && (
                    <>
                      <span className="text-xs text-slate-300">•</span>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded" data-testid={`text-log-component-${log.id}`}>
                        {log.component}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
