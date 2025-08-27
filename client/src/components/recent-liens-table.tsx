import { useQuery } from "@tanstack/react-query";
import { Lien } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface PaginatedResponse {
  liens: Lien[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export function RecentLiensTable() {
  const [currentPage, setCurrentPage] = useState(1);
  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['/api/liens/recent', currentPage],
    queryFn: async () => {
      const response = await fetch(`/api/liens/recent?page=${currentPage}&limit=10`);
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  const { toast } = useToast();
  const [exportFromDate, setExportFromDate] = useState('');
  const [exportToDate, setExportToDate] = useState('');
  const [showDateRange, setShowDateRange] = useState(false);
  
  const liens = data?.liens || [];
  const pagination = data?.pagination;
  
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
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Record Date</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Recording Number</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">County</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Sync Status</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">View PDF</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {[...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4 whitespace-nowrap text-center"><div className="h-4 bg-slate-200 rounded w-20 mx-auto"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-center"><div className="h-4 bg-slate-200 rounded w-32 mx-auto"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-center"><div className="h-4 bg-slate-200 rounded w-24 mx-auto"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-center"><div className="h-6 bg-slate-200 rounded-full w-16 mx-auto"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-center"><div className="h-8 w-16 bg-slate-200 rounded mx-auto"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-center"><div className="h-8 w-24 bg-slate-200 rounded mx-auto"></div></td>
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
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Record Date</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Recording Number</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">County</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Sync Status</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">View PDF</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {liens.map((lien) => (
              <tr key={lien.id} className="hover:bg-slate-50" data-testid={`row-lien-${lien.recordingNumber}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 text-center" data-testid={`text-record-date-${lien.recordingNumber}`}>
                  {new Date(lien.recordDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 text-center" data-testid={`text-recording-number-${lien.recordingNumber}`}>
                  {lien.recordingNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 text-center" data-testid={`text-county-${lien.recordingNumber}`}>
                  {lien.county || 'Maricopa County'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center" data-testid={`sync-status-${lien.recordingNumber}`}>
                  {getStatusBadge(lien.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  {lien.documentUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(lien.documentUrl, '_blank')}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      data-testid={`button-view-pdf-${lien.recordingNumber}`}
                    >
                      <i className="fas fa-file-pdf"></i>
                      <span className="ml-1">View</span>
                    </Button>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  {lien.status !== 'synced' && lien.documentUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        toast({
                          title: "Retrying Sync",
                          description: `Attempting to sync lien ${lien.recordingNumber} to Airtable...`
                        });
                        try {
                          const response = await fetch(`/api/liens/${lien.id}/retry-sync`, { method: 'POST' });
                          if (response.ok) {
                            toast({
                              title: "Sync Successful",
                              description: `Lien ${lien.recordingNumber} has been synced to Airtable.`
                            });
                            // Refetch data
                            window.location.reload();
                          } else {
                            toast({
                              title: "Sync Failed", 
                              description: "Please check the logs for more details.",
                              variant: "destructive"
                            });
                          }
                        } catch (error) {
                          toast({
                            title: "Sync Error",
                            description: "Failed to retry sync. Please try again later.",
                            variant: "destructive"
                          });
                        }
                      }}
                      className="border-purple-500 text-purple-600 hover:bg-purple-500 hover:text-white transition-colors"
                      data-testid={`button-retry-sync-${lien.recordingNumber}`}
                    >
                      <i className="fas fa-sync mr-1"></i>
                      Retry Sync
                    </Button>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing {((currentPage - 1) * pagination.limit) + 1} to{' '}
            {Math.min(currentPage * pagination.limit, pagination.totalCount)} of{' '}
            {pagination.totalCount} records
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="transition-all duration-200"
              data-testid="button-previous-page"
            >
              <i className="fas fa-chevron-left mr-1"></i>
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="min-w-[36px] transition-all duration-200"
                    data-testid={`button-page-${pageNum}`}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === pagination.totalPages}
              className="transition-all duration-200"
              data-testid="button-next-page"
            >
              Next
              <i className="fas fa-chevron-right ml-1"></i>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
