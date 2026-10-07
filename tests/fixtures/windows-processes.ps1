param([Parameter(Mandatory=$true)][uint32]$ParentProcessId)
$ErrorActionPreference = 'Stop'
# Toolhelp reads a native snapshot without starting the WMI service. This is
# read-only, and the parent filter identifies only this test's terminal.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class HaicomoChildProcesses {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Entry {
    public uint size, usage, pid;
    public UIntPtr heap;
    public uint module, threads, parent;
    public int priority;
    public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string executable;
  }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static uint[] Find(uint parent) {
    var snapshot = CreateToolhelp32Snapshot(2, 0);
    if (snapshot == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception();
    try {
      var result = new List<uint>();
      var entry = new Entry { size = (uint)Marshal.SizeOf(typeof(Entry)) };
      if (!Process32FirstW(snapshot, ref entry)) throw new System.ComponentModel.Win32Exception();
      do {
        if (entry.parent == parent && String.Equals(entry.executable, "powershell.exe", StringComparison.OrdinalIgnoreCase)) result.Add(entry.pid);
      } while (Process32NextW(snapshot, ref entry));
      return result.ToArray();
    } finally { CloseHandle(snapshot); }
  }
}
'@
ConvertTo-Json -InputObject @([HaicomoChildProcesses]::Find($ParentProcessId)) -Compress
