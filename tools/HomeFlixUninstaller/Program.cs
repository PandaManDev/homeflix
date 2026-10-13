using Microsoft.Win32;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace HomeFlixUninstaller;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        var uninstall = FindHomeFlixUninstaller();
        if (uninstall is null)
        {
            MessageBox.Show(
                "HomeFlix Cyber Node does not appear to be installed on this Windows account or computer.\n\nIf you installed it for another Windows account, sign into that account and run this tool again.",
                "HomeFlix Uninstaller",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var confirm = MessageBox.Show(
            "This will open the official HomeFlix Cyber Node uninstall process.\n\nYour personal media files are not deleted by this tool. App data is kept unless you choose otherwise in the uninstaller.\n\nContinue?",
            "Uninstall HomeFlix Cyber Node",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);

        if (confirm != DialogResult.Yes)
            return;

        try
        {
            var start = new ProcessStartInfo
            {
                FileName = uninstall.Value.Executable,
                Arguments = uninstall.Value.Arguments,
                UseShellExecute = true
            };
            Process.Start(start);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Windows could not start the HomeFlix uninstaller.\n\n{ex.Message}",
                "HomeFlix Uninstaller",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static (string Executable, string Arguments)? FindHomeFlixUninstaller()
    {
        var roots = new[]
        {
            (RegistryHive.CurrentUser, RegistryView.Registry64),
            (RegistryHive.CurrentUser, RegistryView.Registry32),
            (RegistryHive.LocalMachine, RegistryView.Registry64),
            (RegistryHive.LocalMachine, RegistryView.Registry32)
        };

        foreach (var (hive, view) in roots)
        {
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(hive, view);
                using var uninstallKey = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
                if (uninstallKey is null) continue;

                foreach (var subName in uninstallKey.GetSubKeyNames())
                {
                    using var appKey = uninstallKey.OpenSubKey(subName);
                    var displayName = appKey?.GetValue("DisplayName") as string;
                    if (string.IsNullOrWhiteSpace(displayName) ||
                        !displayName.Contains("HomeFlix Cyber Node", StringComparison.OrdinalIgnoreCase))
                        continue;

                    var command = appKey?.GetValue("UninstallString") as string;
                    if (string.IsNullOrWhiteSpace(command)) continue;

                    var parsed = ParseCommand(command);
                    if (parsed is not null && File.Exists(parsed.Value.Executable))
                        return parsed;
                }
            }
            catch
            {
                // Continue searching other registry views if a key is inaccessible.
            }
        }

        return null;
    }

    private static (string Executable, string Arguments)? ParseCommand(string command)
    {
        var value = Environment.ExpandEnvironmentVariables(command.Trim());
        var quoted = Regex.Match(value, "^\\\"(?<exe>[^\\\"]+)\\\"(?<args>.*)$");
        if (quoted.Success)
            return (quoted.Groups["exe"].Value, quoted.Groups["args"].Value.Trim());

        var split = value.IndexOf(' ');
        var executable = split < 0 ? value : value[..split];
        var arguments = split < 0 ? string.Empty : value[(split + 1)..].Trim();
        return (executable, arguments);
    }
}
