-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: 127.0.0.1    Database: ahenk_sigorta
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `interactions`
--

DROP TABLE IF EXISTS `interactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `interactions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant` varchar(50) NOT NULL,
  `contact_id` varchar(64) NOT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'note',
  `body` text DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_lookup` (`tenant`,`contact_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `policeler`
--

DROP TABLE IF EXISTS `policeler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `policeler` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `hesap_adi` varchar(100) NOT NULL DEFAULT '',
  `arac_plakasi` varchar(20) DEFAULT '',
  `sigorta_sirketi` varchar(80) NOT NULL DEFAULT '',
  `police_turu` varchar(100) DEFAULT '',
  `brut_tl` varchar(50) DEFAULT '',
  `tc_kimlik_no` varchar(20) DEFAULT '',
  `vergi_kimlik_no` varchar(20) DEFAULT '',
  `gsm_no` varchar(30) DEFAULT '',
  `dogum_tarihi` varchar(20) NOT NULL DEFAULT '',
  `bitis_tarihi` varchar(50) DEFAULT '',
  `police_numarasi` varchar(30) NOT NULL DEFAULT '',
  `produktor_tali_adi` varchar(80) NOT NULL DEFAULT '',
  `brut_2026` varchar(50) DEFAULT '',
  `belge_seri_no` varchar(100) DEFAULT '',
  `notlar` text DEFAULT NULL,
  `otomatik_mesaj` text DEFAULT NULL,
  `sistem_durum` varchar(50) DEFAULT 'Çalışılmadı',
  `genel_firma_1` varchar(60) NOT NULL DEFAULT 'ANADOLU SİGORTA',
  `genel_firma_2` varchar(60) NOT NULL DEFAULT '2. FİRMA',
  `genel_firma_3` varchar(100) DEFAULT '3. FİRMA',
  `genel_firma_4` varchar(100) DEFAULT '4. FİRMA',
  `imm_f1_gecen` varchar(20) NOT NULL DEFAULT '',
  `imm_f1_buyil` varchar(20) NOT NULL DEFAULT '',
  `imm_f2_gecen` varchar(20) NOT NULL DEFAULT '',
  `imm_f2_buyil` varchar(20) NOT NULL DEFAULT '',
  `imm_f3_gecen` varchar(20) NOT NULL DEFAULT '',
  `imm_f3_buyil` varchar(20) NOT NULL DEFAULT '',
  `imm_f4_gecen` varchar(20) NOT NULL DEFAULT '',
  `imm_f4_buyil` varchar(20) NOT NULL DEFAULT '',
  `cam_f1_gecen` varchar(20) NOT NULL DEFAULT '',
  `cam_f1_buyil` varchar(20) NOT NULL DEFAULT '',
  `cam_f2_gecen` varchar(20) NOT NULL DEFAULT '',
  `cam_f2_buyil` varchar(20) NOT NULL DEFAULT '',
  `cam_f3_gecen` varchar(20) NOT NULL DEFAULT '',
  `cam_f3_buyil` varchar(20) NOT NULL DEFAULT '',
  `cam_f4_gecen` varchar(20) NOT NULL DEFAULT '',
  `cam_f4_buyil` varchar(20) NOT NULL DEFAULT '',
  `hasarsizlik_f1_gecen` varchar(20) NOT NULL DEFAULT '',
  `hasarsizlik_f1_buyil` varchar(20) NOT NULL DEFAULT '',
  `hasarsizlik_f2_gecen` varchar(20) NOT NULL DEFAULT '',
  `hasarsizlik_f2_buyil` varchar(20) NOT NULL DEFAULT '',
  `hasarsizlik_f3_gecen` varchar(20) NOT NULL DEFAULT '',
  `hasarsizlik_f3_buyil` varchar(20) NOT NULL DEFAULT '',
  `hasarsizlik_f4_gecen` varchar(30) NOT NULL DEFAULT '',
  `hasarsizlik_f4_buyil` varchar(20) NOT NULL DEFAULT '',
  `ikame_f1_gecen` varchar(20) NOT NULL DEFAULT '',
  `ikame_f1_buyil` varchar(20) NOT NULL DEFAULT '',
  `ikame_f2_gecen` varchar(20) NOT NULL DEFAULT '',
  `ikame_f2_buyil` varchar(20) NOT NULL DEFAULT '',
  `ikame_f3_gecen` varchar(20) NOT NULL DEFAULT '',
  `ikame_f3_buyil` varchar(20) NOT NULL DEFAULT '',
  `ikame_f4_gecen` varchar(20) NOT NULL DEFAULT '',
  `ikame_f4_buyil` varchar(20) NOT NULL DEFAULT '',
  `teklif_f1_gecen` varchar(20) NOT NULL DEFAULT '',
  `teklif_f1_buyil` varchar(20) NOT NULL DEFAULT '',
  `teklif_f2_gecen` varchar(20) NOT NULL DEFAULT '',
  `teklif_f2_buyil` varchar(20) NOT NULL DEFAULT '',
  `teklif_f3_gecen` varchar(20) NOT NULL DEFAULT '',
  `teklif_f3_buyil` varchar(20) NOT NULL DEFAULT '',
  `teklif_f4_gecen` varchar(20) NOT NULL DEFAULT '',
  `teklif_f4_buyil` varchar(20) NOT NULL DEFAULT '',
  `deprem_gecen` varchar(20) NOT NULL DEFAULT '',
  `deprem_buyil` varchar(20) NOT NULL DEFAULT '',
  `makina_gecen` varchar(20) NOT NULL DEFAULT '',
  `makina_buyil` varchar(20) NOT NULL DEFAULT '',
  `bina_gecen` varchar(20) NOT NULL DEFAULT '',
  `bina_buyil` varchar(20) NOT NULL DEFAULT '',
  `esya_gecen` varchar(20) NOT NULL DEFAULT '',
  `esya_buyil` varchar(20) NOT NULL DEFAULT '',
  `trafik_taban_fiyat` varchar(50) DEFAULT '',
  `trafik_mini_fiyat` varchar(50) DEFAULT '',
  `trafik_mini_durum` varchar(50) DEFAULT '',
  `excel_row` int(11) DEFAULT NULL COMMENT 'Original Excel row number',
  `version` int(11) DEFAULT 1 COMMENT 'Optimistic lock version',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_by` varchar(30) NOT NULL DEFAULT '',
  `taksit_f1` varchar(5) NOT NULL DEFAULT '1',
  `taksit_f2` varchar(5) NOT NULL DEFAULT '1',
  `taksit_f3` varchar(5) NOT NULL DEFAULT '1',
  `taksit_f4` varchar(5) NOT NULL DEFAULT '1',
  `is_manually_added` tinyint(1) NOT NULL DEFAULT 0,
  `tenant` varchar(50) NOT NULL DEFAULT 'ahenk',
  PRIMARY KEY (`id`),
  KEY `idx_updated_at` (`updated_at`),
  KEY `idx_hesap_adi` (`hesap_adi`),
  KEY `idx_police_turu` (`police_turu`),
  KEY `idx_sistem_durum` (`sistem_durum`),
  KEY `idx_tenant` (`tenant`)
) ENGINE=InnoDB AUTO_INCREMENT=868 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-22 15:02:19
