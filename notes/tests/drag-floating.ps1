param([long]$WindowHandle,[int]$OffsetX,[int]$OffsetY)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DragTest {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref Point p);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
}
'@
[void][DragTest]::SetThreadDpiAwarenessContext([IntPtr](-4))
$originalPointer=New-Object DragTest+Point
[void][DragTest]::GetCursorPos([ref]$originalPointer)
$targetPoint=New-Object DragTest+Point
$targetPoint.X=$OffsetX
$targetPoint.Y=$OffsetY
[void][DragTest]::ClientToScreen([IntPtr]$WindowHandle,[ref]$targetPoint)
try {
 [void][DragTest]::SetCursorPos($targetPoint.X,$targetPoint.Y)
 [DragTest]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 100
 for($step=1;$step -le 10;$step++){[void][DragTest]::SetCursorPos($targetPoint.X+8*$step,$targetPoint.Y+6*$step);Start-Sleep -Milliseconds 25}
} finally {
 [DragTest]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 [void][DragTest]::SetCursorPos($originalPointer.X,$originalPointer.Y)
}
