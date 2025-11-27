import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:crypto/crypto.dart';

class WalletService extends ChangeNotifier {
  String? _walletAddress;
  double _balance = 0.0;
  
  String? get walletAddress => _walletAddress;
  double get balance => _balance;
  
  Future<void> generateWalletAddress(String seed) async {
    // Simple address generation using SHA-256 hash
    // In production, this would use the actual IOTA SDK
    final bytes = utf8.encode(seed);
    final digest = sha256.convert(bytes);
    
    // Generate a mock IOTA address (81 characters)
    final address = digest.toString().padRight(81, '9');
    _walletAddress = address.substring(0, 81);
    
    notifyListeners();
  }
  
  Future<void> updateBalance(double newBalance) async {
    _balance = newBalance;
    notifyListeners();
  }
  
  Future<double> fetchBalance() async {
    // Mock balance fetch - in production would call IOTA network
    return _balance;
  }
  
  bool isValidAddress(String address) {
    // Basic validation for IOTA addresses
    // Real IOTA addresses are 81 characters and use only specific characters
    return address.length == 81 && 
           RegExp(r'^[A-Z9]+$').hasMatch(address);
  }
  
  double calculateNetworkFee(double amount) {
    // IOTA transactions are feeless, but we might add a small service fee
    return 0.0; // Zero fees for remittance
  }
}