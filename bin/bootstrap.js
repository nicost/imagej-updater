/*
 * Please run this Javascript via
 *
 *    Macros>Evaluate Javascript
 *
 * or by hitting Ctrl+J (on MacOSX, Apple+J).
 *
 * If this fails, please call Edit>Select All,
 * Edit>Copy, switch to the main window call
 * File>New>Script..., Edit>Paste, select
 * Language>JavaScript and then hit the Run
 * button.
 */

importClass(Packages.java.io.File);
importClass(Packages.java.lang.System);
importClass(Packages.java.net.URL);
importClass(Packages.java.net.URLClassLoader);
importClass(Packages.java.util.regex.Pattern);

baseURL = 'http://update.imagej.net/jars/';
jars = [
	'imagej-ui-swing-0.4.9.jar-20140709131620',
	'imagej-plugins-uploader-webdav-0.1.1.jar-20140516211031',
	'imagej-updater-0.4.3.jar-20140702234308',
	'scijava-common-2.25.0.jar-20140701184314',
	'imagej-common-0.8.0.jar-20140701184314',
	'eventbus-1.4.jar-20120404210913',
	'gentyref-1.1.0.jar-20140516211031'
];

isCommandLine = typeof arguments != 'undefined';

urls = [];
remoteCount = localCount = 0;
pattern = Pattern.compile("^(.*/)?([^/]*\\.jar)-[0-9]+$");
for (i = 0; i < jars.length; i++) {
	if (isCommandLine && (matcher = pattern.matcher(jars[i])).matches()) {
		file = new File("jars/" + matcher.group(2));
		if (file.exists()) {
			urls[i] = file.toURI().toURL();
			localCount++;
			continue;
		}
	}
	urls[i] = new URL(baseURL + jars[i]);
	remoteCount++;
}

importClass(Packages.java.lang.ClassLoader);
parent = ClassLoader.getSystemClassLoader().getParent();
loader = new URLClassLoader(urls, parent);

if (isCommandLine) {
	importClass(Packages.java.lang.System);

	var IJ = {
		debugMode: false,

		getDirectory: function(label) {
			// command-line: default to current directory
			return new File("").getAbsolutePath();
		},

		showStatus: function(message) {
			print(message + "\n");
		},

		error: function(message) {
			print(message + "\n");
		},

		handleException: function(exception) {
			exception.printStackTrace();
		}
	}

	var updaterClassName = "net.imagej.updater.CommandLine";
} else {
	try {
		importClass(Packages.ij.IJ);
	} catch (e) {
		// ignore; this is a funny PluginClassLoader problem
	}

	if (typeof IJ == 'undefined') {
		importClass(Packages.java.lang.Thread);
		var IJ = Thread.currentThread().getContextClassLoader().loadClass('ij.IJ').newInstance();
	}

	var updaterClassName = "net.imagej.ui.swing.updater.ImageJUpdater";
}


// make sure that the system property 'imagej.dir' is set correctly
if (System.getProperty("imagej.dir") == null) {
	imagejDir = System.getProperty("ij.dir");
	if (imagejDir == null) {
		imagejDir = IJ.getDirectory("imagej");
	}
	if (imagejDir != null) {
		if (imagejDir.endsWith("/jars/") || imagejDir.endsWith("\\jars\\"))
			imagejDir = imagejDir.substring(0, imagejDir.length() - 5);
	} else {
		url = IJ.getClassLoader().loadClass("ij.IJ").getResource("/ij/IJ.class").toString();
		bang = url.indexOf(".jar!/");
		if (url.startsWith("jar:file:") && bang > 0) {
			imagejDir = new File(url.substring(9, bang)).getParent();
			if (imagejDir.endsWith("/target") || imagejDir.endsWith("\\target"))
				imagejDir = imagejDir.substring(0, imagejDir.length() - 7);
		}
		else if (url.startsWith("file:") && bang < 0 && url.endsWith("/ij/IJ.class")) {
			imagejDir = url.substring(5, url.length() - 12);
			if (imagejDir.endsWith("/classes"))
				imagejDir = imagejDir.substring(0, imagejDir.length() - 8);
			if (imagejDir.endsWith("/target"))
				imagejDir = imagejDir.substring(0, imagejDir.length() - 7);
		}
		else {
			IJ.error("Cannot set imagej.dir for " + url);
		}
	}
	System.setProperty("imagej.dir", imagejDir);
}
if (IJ.debugMode) print('ImageJ directory: ' + imagejDir);

// for backwards-compatibility, make sure that the system property 'ij.dir'
// is set correctly, too, just in case
if (System.getProperty("ij.dir") == null) {
	System.setProperty("ij.dir", System.getProperty("imagej.dir"));
}

imagejDir = new File(System.getProperty("imagej.dir"));
if (!new File(imagejDir, "db.xml.gz").exists()) {
	filesClass = loader.loadClass("net.imagej.updater.FilesCollection");
	files = filesClass.getConstructor([ loader.loadClass("java.io.File") ]).newInstance([ imagejDir ]);
	files.getUpdateSite("ImageJ").timestamp = -1;
	if (!"true".equalsIgnoreCase(System.getProperty("skip.fiji"))) {
		IJ.showStatus("adding the Fiji update site");
		files.addUpdateSite("Fiji", "http://fiji.sc/update/", null, null, -1);
	}
	files.write();
}

if (isCommandLine && arguments.length == 1 && "jar-urls".equals(arguments[0])) {
	IJ.showStatus("Loading the FilesCollection class");
	clazz = loader.loadClass("net.imagej.updater.FilesCollection");
	fileClazz = loader.loadClass("java.io.File");
	files = clazz.getConstructor([fileClazz]).newInstance([imagejDir]);

	IJ.showStatus("Updating from the update site");
	xmlClazz = loader.loadClass("net.imagej.updater.XMLFileDownloader");
	xml = xmlClazz.getConstructor([clazz]).newInstance([files]);
	xml.start(true);

	swingUI = files.get("jars/imagej-ui-swing.jar");
	cmdLine = files.get("jars/imagej-updater.jar");
	list = new Array();
	i = 0;
	list[i++] = swingUI;
	list[i++] = files.get("jars/imagej-plugins-uploader-webdav.jar");
	for (iter = cmdLine.getFileDependencies(files, true).iterator();
			iter.hasNext(); ) {
		f = iter.next();
		if (!f.getFilename(true).matches("jars/" +
				"(imglib2|scifio|mapdb|udunits).*")) {
			list[i++] = f;
		}
	}

	prefix = null;
	for (i = 0; i < list.length; i++) {
		url = files.getURL(list[i]);
		if (prefix == null) prefix = url;
		else while (!url.startsWith(prefix)) {
			prefix = prefix.substring(0, prefix.length() - 1);
		}
		list[i] = url;
	}
	output = "baseURL = '" + prefix + "';\n";
	output += "jars = [\n";
	for (i = 0; i < list.length; i++) {
		output += "\t'" + list[i].substring(prefix.length()) + "',\n";
	}
	output = output.substring(0, output.length - 2);
	output += "\n];\n";
	print(output);
	System.exit(0);
}

if (remoteCount > 0) {
	suffix = (localCount > 0 ? "partially " : "") + "remote updater";
} else {
	suffix = "local updater";
}

IJ.showStatus("loading " + suffix);
updaterClass = loader.loadClass(updaterClassName);
IJ.showStatus("running " + suffix);
try {
	i = updaterClass.newInstance();
	if (isCommandLine) {
		i.main(arguments);
	} else {
		Thread.currentThread().setName("Updating the Updater itself!");
		i.run();
	}
} catch (e) {
	IJ.handleException(e.javaException);
}
