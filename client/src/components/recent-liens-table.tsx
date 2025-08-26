import { useQuery } from "@tanstack/react-query";
import { Lien } from "@shared/schema";

export function RecentLiensTable() {
  const { data: liens, isLoading } = useQuery<Lien[]>({
    queryKey: ['/api/liens/recent'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

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
          </div>
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
          <h3 className="text-lg font-semibold text-slate-800">Recent Liens</h3>
          <a href="#" className="text-blue-600 hover:text-blue-700 text-sm font-medium" data-testid="link-view-all">
            View All
          </a>
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
                    {lien.pdfUrl && (
                      <a 
                        href={lien.pdfUrl}
                        target="_blank"
                        className="text-blue-600 hover:text-blue-700"
                        data-testid={`link-view-pdf-${lien.recordingNumber}`}
                      >
                        <i className="fas fa-file-pdf"></i>
                      </a>
                    )}
                    {!lien.pdfUrl && (
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
