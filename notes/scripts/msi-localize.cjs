const fs=require('node:fs/promises');
// WiX UI localization otherwise selects a Western codepage despite Chinese names.
module.exports=async file=>{
 let xml=await fs.readFile(file,'utf8');
 xml=xml.replace('Language="1033" Codepage="65001"','Language="2052" Codepage="936"')
  .replace('<Package Compressed="yes" InstallerVersion="500"/>','<Package Compressed="yes" InstallerVersion="500" SummaryCodepage="936"/>');
 await fs.writeFile(file,xml,'utf8');
};
