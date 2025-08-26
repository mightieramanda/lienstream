import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Sidebar() {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed.toString());
  }, [collapsed]);

  const menuItems = [
    { path: "/", icon: "fas fa-tachometer-alt", label: "Dashboard" },
    { path: "/counties", icon: "fas fa-map", label: "Counties" },
  ];

  return (
    <aside className={cn(
      "bg-white shadow-sm border-r border-slate-200 flex flex-col transition-all duration-300 relative",
      collapsed ? "w-20" : "w-64"
    )}>
      {/* Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-8 z-50 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
        data-testid="button-sidebar-toggle"
      >
        <i className={cn(
          "fas text-xs text-slate-600",
          collapsed ? "fa-chevron-right" : "fa-chevron-left"
        )}></i>
      </button>

      {/* Logo */}
      <div className={cn(
        "border-b border-slate-200 transition-all duration-300",
        collapsed ? "p-4" : "p-6"
      )}>
        <div className={cn(
          "flex items-center",
          collapsed ? "justify-center" : "space-x-3"
        )}>
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-xl font-bold text-slate-800">LienStream</h1>
              <p className="text-xs text-slate-500">Automated Processing</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.path}>
              {collapsed ? (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link href={item.path}>
                      <a 
                        className={cn(
                          "flex items-center justify-center px-3 py-2 rounded-lg font-medium transition-colors",
                          location === item.path 
                            ? "bg-blue-50 text-blue-700" 
                            : "text-slate-600 hover:bg-slate-50"
                        )}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <i className={`${item.icon} w-5`}></i>
                      </a>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link href={item.path}>
                  <a 
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-colors",
                      location === item.path 
                        ? "bg-blue-50 text-blue-700" 
                        : "text-slate-600 hover:bg-slate-50"
                    )}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <i className={`${item.icon} w-5`}></i>
                    <span>{item.label}</span>
                  </a>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      
      {/* User Profile */}
      <div className={cn(
        "border-t border-slate-200 transition-all duration-300",
        collapsed ? "p-3" : "p-4"
      )}>
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                  <i className="fas fa-user text-slate-600 text-sm"></i>
                </div>
                <button 
                  className="text-slate-400 hover:text-slate-600 text-sm" 
                  data-testid="button-logout"
                >
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div>
                <p className="font-medium">Admin User</p>
                <p className="text-xs text-slate-500">Administrator</p>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
              <i className="fas fa-user text-slate-600 text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate" data-testid="user-name">
                Admin User
              </p>
              <p className="text-xs text-slate-500 truncate" data-testid="user-role">
                Administrator
              </p>
            </div>
            <button 
              className="text-slate-400 hover:text-slate-600" 
              data-testid="button-logout"
            >
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
