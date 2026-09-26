import os
import secrets
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

import psycopg
from flask import Blueprint, jsonify, request

from db import get_connection, load_query
import utils

email_verification_bp = Blueprint("email_verification", __name__)


def _send_verification_email(email, code):
    host = os.getenv("BREVO_SMTP_HOST")
    login = os.getenv("BREVO_SMTP_LOGIN")
    password = os.getenv("BREVO_SMTP_PASSWORD")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    sender_name = os.getenv("BREVO_SENDER_NAME")
    try:
        port = int(os.getenv("BREVO_SMTP_PORT", "587"))
    except ValueError as exc:
        raise ValueError("Brevo SMTP port is invalid") from exc

    if not all((host, login, password, sender_email, sender_name)):
        raise ValueError("Brevo SMTP is not fully configured")

    message = EmailMessage()
    message["Subject"] = "Food-Ninja Email Verification"
    message["From"] = formataddr((sender_name, sender_email))
    message["To"] = email
    message.set_content(
        "Hello,\n\n"
        "Your Food-Ninja verification code is:\n\n"
        f"{code}\n\n"
        "This code is valid for 10 minutes.\n\n"
        "Food-Ninja\n"
    )

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.starttls()
        smtp.login(login, password)
        smtp.send_message(message)


@email_verification_bp.post("/verify-email/send")
def send_email_verification():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    if not isinstance(email, str) or not utils.is_valid_email(email.strip()):
        return jsonify({"success": False, "message": "A valid email address is required"}), 400
    email = email.strip().lower()
    code = f"{secrets.randbelow(1_000_000):06d}"

    try:
        _send_verification_email(email, code)
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 503
    except smtplib.SMTPAuthenticationError as exc:
        print(f"[Email Verification] Brevo SMTP authentication error: {exc}", flush=True)
        code_num = getattr(exc, "smtp_code", None)
        err_detail = getattr(exc, "smtp_error", b"")
        if isinstance(err_detail, bytes):
            err_detail = err_detail.decode("utf-8", errors="replace")
        
        if code_num == 525 or "Unauthorized IP" in str(err_detail):
            msg = (
                "Brevo SMTP Error: 525 Unauthorized IP address. "
                "In your Brevo dashboard under 'SMTP & API' -> 'Authorized IP addresses' (or your SMTP Key settings), "
                "either add your current IP address (103.94.135.141) or remove the IP restriction so local testing can connect."
            )
        elif code_num == 535:
            msg = (
                "Brevo SMTP Error: 535 Authentication failed. "
                "Please verify your Brevo login and SMTP Key in Backend/.env."
            )
        else:
            msg = f"Brevo SMTP Authentication Error ({code_num}): {err_detail}"

        return jsonify({"success": False, "message": msg}), 502
    except (smtplib.SMTPException, OSError) as exc:
        print(f"[Email Verification] SMTP send error: {exc}", flush=True)
        return jsonify({"success": False, "message": "Could not send verification email. Please check SMTP settings or request a new code."}), 502

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("email_verification.sql", "upsert_email_verification"), (email, code))
            conn.commit()
        return jsonify({"success": True, "message": "Verification code sent"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Could not save verification code"}), 500


@email_verification_bp.post("/verify-email")
def verify_email():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    code = data.get("code")
    consume = bool(data.get("consume", False))

    if not isinstance(email, str) or not utils.is_valid_email(email.strip()):
        return jsonify({"success": False, "message": "A valid email address is required"}), 400
    if not isinstance(code, str) or len(code) != 6 or not code.isdigit():
        return jsonify({"success": False, "message": "A six-digit verification code is required"}), 400

    email = email.strip().lower()

    try:
        with get_connection() as conn, conn.cursor() as cur:
            query_name = "consume_email_verification" if consume else "get_valid_email_verification"
            cur.execute(
                load_query("email_verification.sql", query_name),
                (email, code),
            )
            if not cur.fetchone():
                return jsonify({"success": False, "message": "Verification code is invalid or expired"}), 400
            conn.commit()
            return jsonify({"success": True, "message": "Email verified successfully"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Email verification failed"}), 500
