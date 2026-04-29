import React, { useState, useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import IconButton from "@material-ui/core/IconButton";
import { X as CloseIcon, Download as DownloadIcon } from "lucide-react";
import api from "../../services/api";

const useStyles = makeStyles(() => ({
	imageWrapper: {
		position: "relative",
		display: "inline-block",
		cursor: "pointer",
		maxWidth: 330,
		minWidth: 160,
		borderRadius: 8,
		overflow: "hidden",
		lineHeight: 0,
	},
	image: {
		width: "100%",
		height: "auto",
		maxHeight: 400,
		objectFit: "cover",
		display: "block",
		transition: "filter 150ms ease",
		"&:hover": {
			filter: "brightness(0.92)",
		},
	},
	imagePlaceholder: {
		width: 250,
		height: 180,
		borderRadius: 8,
		backgroundColor: "#F0F0F0",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
	placeholderPulse: {
		width: 36,
		height: 36,
		borderRadius: "50%",
		border: "3px solid #E0E0E0",
		borderTopColor: "#25D366",
		animation: "$spin 800ms linear infinite",
	},
	"@keyframes spin": {
		"0%": { transform: "rotate(0deg)" },
		"100%": { transform: "rotate(360deg)" },
	},

	dialogBackdrop: {
		backgroundColor: "rgba(0, 0, 0, 0.85)",
	},
	dialogPaper: {
		backgroundColor: "transparent",
		boxShadow: "none",
		maxWidth: "92vw",
		maxHeight: "92vh",
		margin: 0,
		overflow: "visible",
	},
	dialogContent: {
		position: "relative",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
	dialogImage: {
		maxWidth: "90vw",
		maxHeight: "88vh",
		objectFit: "contain",
		borderRadius: 6,
	},
	toolbar: {
		position: "absolute",
		top: 12,
		right: 12,
		display: "flex",
		gap: 8,
	},
	toolbarBtn: {
		backgroundColor: "rgba(0,0,0,0.5)",
		color: "#fff",
		padding: 8,
		"&:hover": {
			backgroundColor: "rgba(0,0,0,0.7)",
		},
	},
}));

const ModalImageCors = ({ imageUrl }) => {
	const classes = useStyles();
	const [fetching, setFetching] = useState(true);
	const [blobUrl, setBlobUrl] = useState("");
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!imageUrl) return;
		const fetchImage = async () => {
			try {
				const { data, headers } = await api.get(imageUrl, {
					responseType: "blob",
				});
				const url = window.URL.createObjectURL(
					new Blob([data], { type: headers["content-type"] })
				);
				setBlobUrl(url);
			} catch {
				// fallback to direct URL
				setBlobUrl(imageUrl);
			}
			setFetching(false);
		};
		fetchImage();
	}, [imageUrl]);

	const handleDownload = (e) => {
		e.stopPropagation();
		const a = document.createElement("a");
		a.href = blobUrl || imageUrl;
		a.download = imageUrl.split("/").pop() || "image";
		a.click();
	};

	if (fetching) {
		return (
			<div className={classes.imagePlaceholder}>
				<div className={classes.placeholderPulse} />
			</div>
		);
	}

	return (
		<>
			<div className={classes.imageWrapper} onClick={() => setOpen(true)}>
				<img
					src={blobUrl}
					alt=""
					className={classes.image}
				/>
			</div>

			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				maxWidth={false}
				BackdropProps={{ className: classes.dialogBackdrop }}
				PaperProps={{ className: classes.dialogPaper }}
			>
				<div className={classes.dialogContent}>
					<img
						src={blobUrl}
						alt=""
						className={classes.dialogImage}
					/>
					<div className={classes.toolbar}>
						<IconButton
							className={classes.toolbarBtn}
							onClick={handleDownload}
							size="small"
						>
							<DownloadIcon size={20} />
						</IconButton>
						<IconButton
							className={classes.toolbarBtn}
							onClick={() => setOpen(false)}
							size="small"
						>
							<CloseIcon size={20} />
						</IconButton>
					</div>
				</div>
			</Dialog>
		</>
	);
};

export default ModalImageCors;
