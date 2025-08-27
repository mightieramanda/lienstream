import { useQuery } from "@tanstack/react-query";
import { Lien } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export function RecentLiensTable() {
  const { data: liens, isLoading } = useQuery<Lien[]>({
    queryKey: ['/api/liens/recent'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  const { toast } = useToast();
  const [exportFromDate, setExportFromDate] = useState('');
  const [exportToDate, setExportToDate] = useState('');
  const [showDateRange, setShowDateRange] = useState(false);
  
  const handleExportAll = () => {
    window.open('/api/liens/export', '_blank');
    toast({
      title: "Export Started",
      description: "Downloading all lien records as CSV."
    });
  };
  
  const handleExportRange = () => {
    if (!exportFromDate || !exportToDate) {
      toast({
        title: "Date Range Required",
        description: "Please select both start and end dates for export.",
        variant: "destructive"
      });
      return;
    }
    
    const params = new URLSearchParams();
    params.append('from', exportFromDate);
    params.append('to', exportToDate);
    
    window.open(`/api/liens/export?${params.toString()}`, '_blank');
    
    toast({
      title: "Export Started",
      description: `Downloading liens from ${exportFromDate} to ${exportToDate}`
    });
    
    setShowDateRange(false);
    setExportFromDate('');
    setExportToDate('');
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Recent Records</h3>
            <div className="animate-pulse h-4 bg-slate-200 rounded w-16"></div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Record Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Document</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Debtor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {[...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-slate-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-slate-200 rounded w-36"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-6 bg-slate-200 rounded-full w-16"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-2">
                      <div className="h-8 w-8 bg-slate-200 rounded"></div>
                      <div className="h-8 w-8 bg-slate-200 rounded"></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!liens || liens.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Recent Records</h3>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportAll}
                className="flex items-center justify-center transition-all duration-200 border-blue-500 hover:bg-blue-500 hover:text-white hover:shadow-md"
                data-testid="button-export-all"
              >
                <i className="fas fa-download mr-1"></i>
                Export All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowDateRange(!showDateRange)}
                className={`flex items-center justify-center transition-all duration-200 ${showDateRange ? 'bg-blue-500 text-white border-blue-500' : 'border-blue-500 hover:bg-blue-500 hover:text-white hover:shadow-md'}`}
                data-testid="button-toggle-date-range"
              >
                <i className="fas fa-calendar mr-1"></i>
                Date Range
              </Button>
            </div>
          </div>
          {showDateRange && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-slate-600 mb-1 block">From Date</label>
                  <Input
                    type="date"
                    value={exportFromDate}
                    onChange={(e) => setExportFromDate(e.target.value)}
                    className="h-8"
                    data-testid="input-export-from-date"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-600 mb-1 block">To Date</label>
                  <Input
                    type="date"
                    value={exportToDate}
                    onChange={(e) => setExportToDate(e.target.value)}
                    className="h-8"
                    data-testid="input-export-to-date"
                  />
                </div>
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={handleExportRange}
                  disabled={!exportFromDate || !exportToDate}
                  className="flex items-center justify-center transition-all duration-200 bg-blue-500 text-white border-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200"
                  data-testid="button-export-range"
                >
                  <span>Export Range</span>
                </Button>
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowDateRange(false);
                    setExportFromDate('');
                    setExportToDate('');
                  }}
                  className="flex items-center justify-center transition-all duration-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                  data-testid="button-cancel-range"
                >
                  <span>Cancel</span>
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-file-medical text-slate-400 text-xl"></i>
          </div>
          <h4 className="text-lg font-medium text-slate-800 mb-2">No records found</h4>
          <p className="text-slate-500">No records have been scraped yet. Run the automation to start collecting data.</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'pending': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
      'processing': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Processing' },
      'synced': { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Synced' },
      'completed': { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Completed' },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['pending'];
    
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Recent Records</h3>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportAll}
              className="flex items-center justify-center transition-all duration-200 border-blue-500 hover:bg-blue-500 hover:text-white hover:shadow-md"
              data-testid="button-export-all"
            >
              <i className="fas fa-download mr-1"></i>
              Export All
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowDateRange(!showDateRange)}
              className={`flex items-center justify-center transition-all duration-200 ${showDateRange ? 'bg-blue-500 text-white border-blue-500' : 'border-blue-500 hover:bg-blue-500 hover:text-white hover:shadow-md'}`}
              data-testid="button-toggle-date-range"
            >
              <i className="fas fa-calendar mr-1"></i>
              Date Range
            </Button>
          </div>
        </div>
        {showDateRange && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-600 mb-1 block">From Date</label>
                <Input
                  type="date"
                  value={exportFromDate}
                  onChange={(e) => setExportFromDate(e.target.value)}
                  className="h-8"
                  data-testid="input-export-from-date"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-600 mb-1 block">To Date</label>
                <Input
                  type="date"
                  value={exportToDate}
                  onChange={(e) => setExportToDate(e.target.value)}
                  className="h-8"
                  data-testid="input-export-to-date"
                />
              </div>
              <Button 
                size="sm"
                variant="outline"
                onClick={handleExportRange}
                disabled={!exportFromDate || !exportToDate}
                className="flex items-center justify-center transition-all duration-200 bg-blue-500 text-white border-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200"
                data-testid="button-export-range"
              >
                <span>Export Range</span>
              </Button>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowDateRange(false);
                  setExportFromDate('');
                  setExportToDate('');
                }}
                className="flex items-center justify-center transition-all duration-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                data-testid="button-cancel-range"
              >
                <span>Cancel</span>
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Record Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Document</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Debtor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {liens.map((lien) => (
              <tr key={lien.id} className="hover:bg-slate-50" data-testid={`row-lien-${lien.recordingNumber}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900" data-testid={`text-record-date-${lien.recordingNumber}`}>
                  {new Date(lien.recordDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900" data-testid={`text-document-number-${lien.recordingNumber}`}>
                  {lien.recordingNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-900" data-testid={`text-debtor-name-${lien.recordingNumber}`}>
                    {lien.debtorName}
                  </div>
                  {lien.debtorAddress && (
                    <div className="text-sm text-slate-500" data-testid={`text-debtor-address-${lien.recordingNumber}`}>
                      {lien.debtorAddress}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900" data-testid={`text-amount-${lien.recordingNumber}`}>
                  {formatAmount(lien.amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap" data-testid={`status-${lien.recordingNumber}`}>
                  {getStatusBadge(lien.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center space-x-2">
                    {lien.documentUrl && (
                      <a 
                        href={lien.documentUrl}
                        target="_blank"
                        className="text-blue-600 hover:text-blue-700"
                        data-testid={`link-view-pdf-${lien.recordingNumber}`}
                      >
                        <i className="fas fa-file-pdf"></i>
                      </a>
                    )}
                    {!lien.documentUrl && (
                      <span className="text-slate-400">
                        <i className="fas fa-file-pdf"></i>
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
